FROM node:24-bookworm AS dependencies

RUN npm install --global pnpm@10.19.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS app-builder

COPY . .
RUN pnpm build
RUN pnpm --filter @thai-translate/api deploy --prod /opt/api

FROM dependencies AS android-toolchain

ARG ANDROID_COMMAND_LINE_TOOLS_VERSION=15859902
ARG ANDROID_COMMAND_LINE_TOOLS_SHA256=4e4c464f145a7512b57d088ac6c278c03c9eea610886b35a5e0804e74eedf583

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV JAVA_HOME=/opt/java-17
ENV PATH="/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:${PATH}"

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl openjdk-17-jdk-headless unzip \
  && ln -s "$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")" "$JAVA_HOME" \
  && rm -rf /var/lib/apt/lists/*
RUN mkdir -p "$ANDROID_HOME/cmdline-tools" \
  && curl --fail --location --retry 3 \
    "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMAND_LINE_TOOLS_VERSION}_latest.zip" \
    --output /tmp/android-command-line-tools.zip \
  && printf '%s  %s\n' "$ANDROID_COMMAND_LINE_TOOLS_SHA256" /tmp/android-command-line-tools.zip \
    | sha256sum --check --strict \
  && unzip -q /tmp/android-command-line-tools.zip -d "$ANDROID_HOME/cmdline-tools" \
  && mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" \
  && rm /tmp/android-command-line-tools.zip
RUN yes | sdkmanager --licenses >/dev/null \
  && sdkmanager \
    'build-tools;36.0.0' \
    'cmake;3.22.1' \
    'ndk;27.1.12297006' \
    'platforms;android-36'

FROM android-toolchain AS apk-builder

ARG EXPO_PUBLIC_API_BASE_URL=https://translate.hetz.autismstaking.xyz
ENV EXPO_PUBLIC_API_BASE_URL=$EXPO_PUBLIC_API_BASE_URL

COPY . .
RUN APK_OUTPUT_PATH=/tmp/thai-ai-translate.apk ./scripts/build-apk.sh

FROM node:24-alpine AS runtime

RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV PROMPTS_DIR=/app/config/prompts
ENV STATIC_DIR=/app/web

WORKDIR /app
COPY --from=app-builder /opt/api /app/api
COPY --from=app-builder /app/apps/client/dist /app/web
COPY --from=apk-builder /tmp/thai-ai-translate.apk /app/web/thai-ai-translate.apk
COPY config/prompts /app/config/prompts
RUN test -s /app/web/thai-ai-translate.apk

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "/app/api/dist/server.js"]

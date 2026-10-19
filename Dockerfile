FROM node:22-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 CACHE_DIR=/app/.cache
WORKDIR /app
COPY --chown=node:node package.json server.mjs index.html ./
COPY --chown=node:node server ./server
COPY --chown=node:node src ./src
COPY --chown=node:node assets ./assets
RUN mkdir -p /app/.cache && chown node:node /app/.cache
USER node
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]

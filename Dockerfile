# iSFN: de site plus een kleine beheerserver. Geen npm-dependencies nodig.
ARG NODE_IMAGE=node:22-alpine
FROM ${NODE_IMAGE}

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app

# Alleen wat de server nodig heeft (zie ook .dockerignore).
COPY server ./server
COPY game ./game
COPY Images ./Images
COPY Sounds ./Sounds
COPY media-vragen ./media-vragen
COPY index.html keuze-menu.html style.css ./

# Vragen, back-ups en geüploade media staan in /data. Maak die map vóór VOLUME aan,
# zodat een nieuw volume van de gebruiker "node" is en de server er kan schrijven.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server/server.js"]

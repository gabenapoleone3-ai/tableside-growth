FROM node:20-alpine
WORKDIR /app
COPY package.json ./package.json
COPY server.js ./server.js
COPY index.html ./index.html
COPY app.js ./app.js
COPY styles.css ./styles.css
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]

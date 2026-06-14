FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm config set registry https://registry.npmmirror.com
RUN npm install --omit=dev

COPY . .

EXPOSE 8223

CMD ["npm", "start"]

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY lib ./lib
COPY services ./services
COPY panel ./panel

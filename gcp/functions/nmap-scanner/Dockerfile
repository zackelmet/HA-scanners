# Dockerfile for Nmap Cloud Function
FROM node:20-slim

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .

# CMD to start the function
CMD ["npx", "@google-cloud/functions-framework", "--target=nmapScanner"]
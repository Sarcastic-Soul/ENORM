FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package.json .
RUN npm install

# Copy source code from the 'src' directory
COPY src/ src/

# Expose Manager (5000) and App (8080) ports
EXPOSE 5000 8080

# Use a generic node entrypoint, but allow the user to specify args
ENTRYPOINT ["node"]
CMD ["src/edge-manager.js"]

FROM node:18-alpine

WORKDIR /server

# Install dependencies
COPY package.json .
RUN npm install

# Copy source code from the 'src' directory
COPY src/ .

# Expose Manager (5000) and App (8080) ports
EXPOSE 5000 8080

# Start the Manager by default
CMD ["node", "edge-manager.js"]

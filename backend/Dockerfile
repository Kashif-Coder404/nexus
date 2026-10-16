# syntax=docker/dockerfile:1

FROM node:22

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies (including tsx for running typescript)
RUN npm ci

# Copy application source code
COPY . .

# Expose backend port
EXPOSE 3100

# Start server using tsx
CMD ["npm", "run", "dev"]


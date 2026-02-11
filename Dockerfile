FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Create data directory if it doesn't exist
RUN mkdir -p data

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

FROM node:20 AS builder

# Declare build arguments
ARG NUXT_PUBLIC_SUPABASE_URL
ARG NUXT_PUBLIC_SUPABASE_KEY

WORKDIR /app

# Set build arguments as environment variables
ENV NUXT_PUBLIC_SUPABASE_URL=$NUXT_PUBLIC_SUPABASE_URL
ENV NUXT_PUBLIC_SUPABASE_KEY=$NUXT_PUBLIC_SUPABASE_KEY

# Copy package.json and yarn.lock first to leverage layer caching
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install

# Copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# Production stage - multi-stage build to reduce image size
FROM node:20-slim

WORKDIR /app

# Copy only necessary files from the builder stage
COPY --from=builder /app/.output /app/.output

ENV NUXT_HOST=0.0.0.0
ENV NUXT_PORT=3000

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
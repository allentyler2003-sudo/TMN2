# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
# Empty REACT_APP_BACKEND_URL => the built app calls /api on its own origin.
# For split hosting (frontend on Cloudflare Pages, API on another domain) set
# REACT_APP_BACKEND_URL=https://api.your-domain.co.uk in the build environment instead.
RUN REACT_APP_BACKEND_URL= yarn build

# Serve stage
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80

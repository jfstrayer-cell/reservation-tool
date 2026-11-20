/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  webpack(config) {
    // Source files import each other with ".js" (Node ESM style); resolve them to the .ts files.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
export default nextConfig;

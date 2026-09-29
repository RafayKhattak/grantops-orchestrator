import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "unpdf",
    "@huggingface/transformers",
    "googleapis",
    "groq-sdk",
    "onnxruntime-node",
  ],
  experimental: {
    proxyClientMaxBodySize: "20mb",
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;

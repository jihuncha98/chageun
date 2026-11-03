import type { NextConfig } from 'next';
const config: NextConfig = {output:'export', trailingSlash:true, basePath:process.env.NEXT_PUBLIC_BASE_PATH || '/chageun', images:{unoptimized:true}};
export default config;

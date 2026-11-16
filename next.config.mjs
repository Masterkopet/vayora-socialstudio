import path from 'node:path';

export default {
 output:'standalone',
 poweredByHeader:false,
 reactStrictMode:true,
 serverExternalPackages:['sharp','busboy'],
 outputFileTracingIncludes:{'/*':['./knowledge/vayora-brand.json','./public/brand/**','./node_modules/@img/**']},
 outputFileTracingExcludes:{'/*':['./data/**','./test-results/**','./deployment-private/**','./deployment-packages/**','./.env*']},
 turbopack:{root:path.resolve(process.cwd())},
};

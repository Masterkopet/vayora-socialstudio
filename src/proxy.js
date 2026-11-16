import { NextResponse } from 'next/server';

export function proxy(request){
 const nonce=Buffer.from(crypto.randomUUID()).toString('base64'),development=process.env.NODE_ENV!=='production';
 const csp=`default-src 'self'; script-src 'self' 'nonce-${nonce}'${development?" 'unsafe-eval'":''}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${development?' ws: wss:':''}; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
 const response=NextResponse.next({request:{headers}});
 response.headers.set('Content-Security-Policy',csp);response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('X-Frame-Options','DENY');response.headers.set('Referrer-Policy','same-origin');response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!api|auth|health|media|public|tracking|go|_next/static|_next/image|brand|vendor|tracker.js|tracking-test.js|favicon.ico).*)']};

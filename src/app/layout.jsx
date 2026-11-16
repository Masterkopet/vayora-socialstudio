import { headers } from 'next/headers';
import Script from 'next/script';
import '../styles/workspace.css';
import '../styles/app.css';

export const metadata={title:'Vayora Social Studio',description:'Workspace internal tim untuk konten dan publikasi Vayora',icons:{icon:'/brand/icon.svg'}};
export const viewport={width:'device-width',initialScale:1,themeColor:'#00285c'};
export default async function RootLayout({children}){
 const nonce=(await headers()).get('x-nonce')||undefined;
 return <html lang="id" suppressHydrationWarning><body><Script src="/vendor/lucide.min.js" strategy="beforeInteractive" nonce={nonce}/>{children}</body></html>;
}

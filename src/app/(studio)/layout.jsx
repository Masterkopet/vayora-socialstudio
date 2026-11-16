import StudioClient from '../../components/StudioClient.jsx';

export default function WorkspaceLayout({children}){
 return <><StudioClient/>{children}<noscript>Aktifkan JavaScript untuk membuka workspace internal Vayora.</noscript></>;
}

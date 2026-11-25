import StudioClient from '../../components/StudioClient.jsx';

export default function WorkspaceLayout({children}){
 return <><StudioClient/>{children}<noscript>Enable JavaScript to open the Vayora internal workspace.</noscript></>;
}

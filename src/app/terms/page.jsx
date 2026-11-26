import LegalPage from '../../components/LegalPage.jsx';
import { terms } from '../../legal/content.js';

export const metadata = { title: 'Terms of Service · Syarat dan Ketentuan — Vayora Social Studio', description: 'Terms for using Vayora Social Studio.' };
export default function TermsPage() { return <LegalPage content={terms} />; }

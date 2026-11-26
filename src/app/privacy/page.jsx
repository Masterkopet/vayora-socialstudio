import LegalPage from '../../components/LegalPage.jsx';
import { privacy } from '../../legal/content.js';

export const metadata = { title: 'Privacy Policy · Kebijakan Privasi — Vayora Social Studio', description: 'How Vayora Social Studio processes and protects data.' };
export default function PrivacyPage() { return <LegalPage content={privacy} />; }

import { notFound } from 'next/navigation';
import { pageIds } from '../../../client/navigation.js';

export default async function WorkspacePage({params}){
 const {view}=await params;
 if(!pageIds.includes(view))notFound();
 return null;
}

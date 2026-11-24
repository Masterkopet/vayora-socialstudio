'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { mountStudio } from '../client/studio.js';
import { pageIds } from '../client/navigation.js';

// React owns the persistent workspace host; the mature editing controller owns
// its interactive subtree, including native dialogs and media playback.
export default function StudioClient(){
 const root=useRef(null),controller=useRef(null),latestPath=useRef(''),router=useRouter(),pathname=usePathname();
 latestPath.current=pathname;
 useEffect(()=>{
  const instance=mountStudio(root.current,{initialView:latestPath.current.slice(1)||'home',navigate:(view,{replace=false}={})=>router[replace?'replace':'push']('/'+view)});
  controller.current=instance;
  return()=>{instance.dispose();controller.current=null;};
 },[router]);
 useEffect(()=>{const view=pathname.slice(1)||'home';if(pageIds.includes(view))controller.current?.syncRoute(view);},[pathname]);
 const view=pathname.slice(1);
 if(view&&!pageIds.includes(view))return null;
 return <div id="vayora-studio-complete" ref={root} suppressHydrationWarning/>;
}

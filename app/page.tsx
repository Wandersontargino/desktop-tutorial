import SolarApp from './solar-app';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await getChatGPTUser();
 return <SolarApp signedIn={!!user} userName={user?.fullName||'Wanderson'} />;
}

import {Buffer} from 'node:buffer';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {hasAdminAccess} from '@/lib/admin-access';
import {developmentSourceResponse} from '@/lib/development-source';

export const dynamic='force-dynamic';

export async function GET(request:Request) {
  return developmentSourceResponse(request,{
    getUser:getChatGPTUser,
    hasAdminAccess,
    readArchive:async()=>{
      const {workspaceSourceBase64} = await import('@/lib/generated/claude-workspace');
      return new Uint8Array(Buffer.from(workspaceSourceBase64,'base64'));
    },
  });
}

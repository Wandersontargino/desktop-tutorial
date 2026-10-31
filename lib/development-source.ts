export type DevelopmentSourceDependencies = {
  getUser: () => Promise<{userId:string}|null>;
  hasAdminAccess: (request:Request, userId:string) => Promise<boolean>;
  readArchive: () => Promise<Uint8Array>;
};

const headers = {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};

export async function developmentSourceResponse(request:Request, dependencies:DevelopmentSourceDependencies) {
  try {
    const user = await dependencies.getUser();
    if (!user) return Response.json({error:'Entre com sua conta para baixar o projeto.'},{status:401,headers});
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({error:'Origem não permitida.'},{status:403,headers});
    }
    if (!await dependencies.hasAdminAccess(request,user.userId)) {
      return Response.json({error:'Desbloqueie o administrador para baixar os códigos do projeto.'},{status:403,headers});
    }
    const archive = await dependencies.readArchive();
    return new Response(new Uint8Array(archive),{headers:{...headers,
      'Content-Type':'application/zip',
      'Content-Disposition':'attachment; filename="CoopSun_Projeto_Claude_Code.zip"',
      'Content-Length':String(archive.byteLength),
    }});
  } catch {
    return Response.json({error:'Não foi possível preparar o download. Tente novamente.'},{status:503,headers});
  }
}

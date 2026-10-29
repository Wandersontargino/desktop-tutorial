# Eleitoral Pará para Windows

Instalador EXE por usuário para Windows 10/11. Usa a plataforma privada central com o login autorizado e a senha da base. O perfil habitual do navegador conserva a autenticação e a cópia offline; Edge/Chrome abrem em janela de aplicativo. Outros navegadores usam a abertura HTTPS padrão.

O instalador cria atalhos, registra a desinstalação e instala em LocalAppData/EleitoralParaConectado, sem privilégios de administrador. Não contém banco de eleitores ou credenciais e não altera cópias independentes antigas. A desinstalação preserva dados centrais e o perfil do navegador. O EXE não possui certificado comercial de assinatura.

## Compilação e validação

Em Windows com .NET Framework e Inno Setup 6, execute `./windows-launcher/build.ps1` em PowerShell. O script compila a aplicação, executa a política de destino HTTPS, constrói o instalador, realiza instalação e desinstalação silenciosas em diretório temporário e compara os hashes dos arquivos instalados. A saída inclui o EXE e a verificação JSON.

O workflow `installers.yml` executa esse fluxo em Windows Server 2025. O teste não efetua login real na conta do proprietário nem substitui uma avaliação física no aparelho do usuário. O aplicativo acompanha as atualizações da plataforma web, e o instalador pode ser atualizado na mesma pasta.

# Eleitoral Pará para Android 2.15.0

Abre a plataforma HTTPS no navegador do aparelho, com suporte a Custom Tabs. O banco, os relatórios e a cópia protegida offline pertencem ao endereço e ao perfil do navegador usados. Nenhuma base de eleitores, senha ou chave de serviço é incluída no APK.

Pacote `br.com.analiseeleitoralpara`, versionCode 21500, Android 8.0 ou posterior e target API 36. O endereço salvo usa a mesma Activity e preferência das versões anteriores. O endereço inicial é o site privado existente; o acesso autorizado continua obrigatório, sem precisar manter a conversa aberta. Configurar outro endereço exige que a hospedagem independente já exista.

Para compilar, instale a plataforma oficial Android 36 e Build Tools 36.0.0. Execute `python3 android-launcher/build.py --sdk CAMINHO_SDK --signing-dir CAMINHO_PRIVADO`. Esse diretório privado deve conter a chave original e sua configuração; o script recusa gerar uma assinatura substituta e verifica a impressão digital original. Nunca coloque esse diretório no repositório ou na entrega. A saída em `output` contém APK e verificações; `build` é temporário.

O GitHub compila com `--unsigned-only`. O APK alinhado e o verificador oficial retornam para assinatura local por `sign.py`, de modo que a chave e sua senha permaneçam fora do GitHub. O APK entregue é assinado com a mesma identidade das versões anteriores.

Verificações de compilação: recursos/manifesto, D8, assinaturas v2/v3, alinhamento, identidade, ausência de permissões e credenciais. Abertura, login, impressão e offline em aparelho físico continuam dependendo de teste no dispositivo.

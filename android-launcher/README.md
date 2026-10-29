# Android instalado — 2.16.0

O APK inclui a interface completa, as duas bases eleitorais públicas (144 municípios por cargo), relatórios, OCR em português e o leitor de PDFs. A tela principal é servida pelo próprio APK no contexto HTTPS `appassets.androidplatform.net`; nenhum navegador externo é aberto ao iniciar.

## Cadastros privados e sincronização

Na primeira conexão, use **Conectar base** para autorizar a conta do Site privado dentro da janela de conta. Ela não tem acesso à ponte nativa. Volte ao aplicativo e entre com a senha da base e o segundo fator, quando exigido. Os cookies da conta permanecem no armazenamento privado do Android; o APK não contém cookies, senhas, chaves de serviço ou cadastros reais.

A cópia dos cadastros utiliza o cofre existente: AES-GCM de 256 bits com PBKDF2/SHA-256 de 600 mil iterações, senha da base e validade offline de sete dias desde a última validação central. Os arquivos instalados não expiram. **Usar cópia offline** permite consultar e editar o cofre mesmo quando há internet e a autorização da conta precisa ser renovada.

Alterações aprovadas são retomadas ao recuperar conexão **com o aplicativo aberto e a base desbloqueada**. Revisões, identificadores idempotentes e divergências entre aparelhos mantêm as regras do servidor. O Android não executa sincronização de cadastros com o aplicativo fechado. Ao sair para outro aplicativo, a base é bloqueada e os rascunhos são preservados de forma criptografada. A janela de escolha de arquivos não interrompe a importação ou exportação.

Relatórios e backups são salvos pelo seletor de documentos do Android. Importações usam o seletor do sistema; não há permissão de acesso geral aos arquivos. Consultas favoritas ficam neste aparelho. A base eleitoral pública incluída no APK e a interface são renovadas por uma atualização do APK; a gestão de novas bases eleitorais continua no site central.

## Compilação e validação

Com Node.js 24 e o SDK oficial (plataforma 36, Build Tools 36.0.0):

```sh
npm ci
npm run build
node android-launcher/prepare-assets.mjs
node scripts/check_native_android.mjs
python3 android-launcher/build.py --sdk /caminho/ao/sdk --unsigned-only
python3 android-launcher/test-device.py --sdk /caminho/ao/sdk
```

O fluxo GitHub Actions executa instrumentação em Android 15, com pessoas e credenciais fictícias: inicialização sem internet, dados locais, criptografia, senha incorreta, criação de cadastro, bloqueio, reinício e retomada da fila aprovada com servidor simulado. O login real e o envio para produção precisam ser autorizados no aparelho pelo titular; os testes não usam nem alteram a base de produção.

A chave original de distribuição fica fora do Git e do CI. O pacote unsigned é assinado localmente por `sign.py`, que exige a mesma impressão digital das versões anteriores e verifica as assinaturas v2 e v3. As chaves descartáveis dos testes permanecem em `build/` e não são distribuídas.

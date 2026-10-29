# Como reproduzir o projeto

Este guia acompanha a entrega de 29/10/2026. O código da aplicação validada está no commit `731f4615e55c2532d717d7eb1f465803d9886c92`; a branch `release/entrega-final-2026-10-29` também preserva estas instruções. As versões de cada componente estão no [registro da entrega](entrega-final-2026-10-29.json).

## 1. Obter uma cópia

Use uma conta com acesso ao repositório privado:

```sh
git clone https://github.com/Wandersontargino/desktop-tutorial.git analise-eleitoral-pa
cd analise-eleitoral-pa
git switch --detach origin/release/entrega-final-2026-10-29
```

Para fazer alterações a partir dessa entrega:

```sh
git switch -c minha-proxima-versao
```

Também é possível selecionar a branch da entrega no GitHub e usar **Code → Download ZIP**. O clone Git preserva o histórico de versões para manutenção.

## 2. Preparar o ambiente e construir a plataforma

Use Git, Node.js 24 e npm. Em Linux, os testes de navegador também precisam das dependências de sistema instaladas pelo Playwright.

```sh
npm ci
npm run build
npm run check
npx playwright install --with-deps chromium firefox webkit
npm run check:browser
```

`npm ci` usa `package-lock.json`. O build recompõe os 440 arquivos públicos a partir das partes em `.github/public-assets/`, conferindo o SHA-256 de cada parte e do conjunto.

| Diretório | Finalidade |
| --- | --- |
| `src/` e `public/` | Interface, relatórios e recursos do navegador |
| `lib/` | Modelos, validações e rotinas compartilhadas |
| `worker/` | API, identidade, cadastros, segurança e backups |
| `drizzle/` | Migrações do banco de dados |
| `dist/client/` | Interface e recursos públicos gerados pelo build |
| `dist/server/index.js` | Worker gerado pelo build |
| `android-launcher/` | Aplicativo Android e instrumentação de teste |
| `windows-launcher/` | Aplicativo conectado e instalador Windows |

O servidor em `scripts/e2e-server.mjs` é o suporte dos testes locais. A implantação utiliza o Worker e o serviço de identidade da hospedagem.

## 3. Preparar uma nova instância privada

A cópia de desenvolvimento usa dados iniciais vazios, importações históricas desativadas e um proprietário demonstrativo. A reprodução da aplicação e a recuperação de uma base particular são operações separadas.

Antes de implantar:

1. Crie uma instância privada no provedor e registre seu próprio identificador em `.openai/hosting.json`, preservando as declarações de armazenamento.
2. Configure um banco D1 com binding `DB`, aplique as migrações de `drizzle/` e configure um bucket R2 com binding `BUCKET`. Esses nomes são usados pelo código e pelo manifesto.
3. Configure o titular real no backend: a constante `OWNER` em `worker/crm.mjs` está como `owner@example.test` nesta cópia. Os exemplos de teste continuam fictícios.
4. Mantenha a autenticação do provedor antes do Worker. A aplicação espera `oai-authenticated-user-id` e `oai-authenticated-user-email` verificados por esse provedor; cabeçalhos enviados diretamente por visitantes não constituem autenticação.
5. Cadastre os segredos no ambiente de execução, fora do Git, conforme a tabela abaixo.
6. Publique o Worker e os arquivos de `dist/client/` pelo fluxo da hospedagem privada. Confirme o acesso restrito ao proprietário antes de preparar usuários ou dados reais.
7. Entre com a conta autorizada, defina a senha da base e configure o segundo fator. Faça a primeira validação com registros fictícios.

| Configuração | Uso |
| --- | --- |
| `DB` | Banco central da instância |
| `BUCKET` | Dados versionados e cópias protegidas |
| `CRM_MFA_KEY` | Segredo de proteção do segundo fator; o código exige pelo menos 32 caracteres |
| `PA_AUTOMATIC_BACKUP_KEY` | Chave de backup: 64 caracteres hexadecimais, guardada também em local seguro para recuperação |
| `PA_PRIVATE_BACKUP_UPDATER` | Valor `enabled` somente após confirmar a proteção da rotina de serviço pelo acesso privado do proprietário |

Configure chaves novas para uma instância nova. Para recuperar backups existentes, use a chave correspondente àquelas cópias pelo procedimento de recuperação autorizado. O endpoint de manutenção automática cria e verifica cópias; a restauração passa pela revisão própria da plataforma.

O agendamento externo de backup da instância original é mantido separadamente. Uma nova instância precisa de seu próprio agendamento e credenciais de serviço. O backend preserva as últimas 14 cópias automáticas verificadas.

## 4. Recompilar o Android

Requisitos adicionais: Python 3, um JDK com `java`, `javac` e `keytool`, Android SDK com plataforma 36 e Build Tools 36.0.0.

Depois da instalação das dependências:

```sh
npm run build
node android-launcher/prepare-assets.mjs
node scripts/check_native_android.mjs
python3 android-launcher/build.py --sdk /caminho/ao/android-sdk --unsigned-only
```

O resultado fica em `android-launcher/output/`, incluindo o APK sem assinatura e os metadados da compilação. A interface, os dados eleitorais públicos, o leitor de PDFs e o OCR são incluídos no pacote.

Para preparar os pacotes de teste em emulador:

```sh
python3 android-launcher/test-device.py --sdk /caminho/ao/android-sdk
```

A sequência de instalação, modo avião e instrumentação está em [installers.yml](../.github/workflows/installers.yml). Os pacotes de teste usam uma identidade descartável separada da assinatura de distribuição.

### Assinar uma atualização do aplicativo existente

Use a chave original e o diretório de assinatura autorizado, mantidos fora do repositório:

```sh
python3 android-launcher/sign.py --input android-launcher/output/Eleitoral-Para-Android-2.16.1-unsigned.apk --signer android-launcher/output/apksigner.jar --signing-dir /diretorio-privado/assinatura --output /diretorio-privado/entrega --metadata android-launcher/output/verification-android-build.json
```

O diretório privado contém o PKCS12 original e sua configuração local. O script confere o certificado esperado e as assinaturas v2 e v3. Preserve uma cópia segura da identidade original para produzir atualizações compatíveis no futuro; o código no GitHub não inclui essa chave.

### Adaptar para outra plataforma ou outro aplicativo

Os aplicativos desta entrega apontam para a instância original. Para outra instância, ajuste em conjunto os destinos e suas verificações:

- Android: `CENTRAL` e `CENTRAL_HOST` em `android-launcher/project/src/br/com/analiseeleitoralpara/MainActivity.java`.
- Windows: `LaunchPolicy.Origin` em `windows-launcher/Launcher.cs`, o endereço registrado nos metadados de `windows-launcher/build.ps1` e os atalhos e instruções associados.
- Para outro aplicativo Android, configure pacote, nome, ícones e identidade de assinatura próprios, ajustando as verificações de pacote e certificado dos scripts correspondentes.

Para atualizar a versão Android, revise `AndroidManifest.xml`, `native/device.js` e `prepare-assets.mjs` dentro de `android-launcher/`. Refaça a compilação e as verificações após alterar destino, identidade ou versão.

O login de produção é concluído pelo titular no aparelho. Os testes automatizados usam contas e cadastros fictícios; a entrega registrada validou 17 verificações em Android 15 e 555 recursos incluídos no APK.

## 5. Recompilar o Windows

Em Windows com .NET Framework e Inno Setup 6, na raiz do repositório:

```powershell
./windows-launcher/build.ps1
```

O script compila, confere a política de destino HTTPS, testa instalação e desinstalação em pasta temporária e verifica os hashes dos arquivos. A saída fica em `windows-launcher/output/`.

O programa Windows abre a plataforma privada em janela de aplicativo usando o perfil habitual do navegador. O instalador acompanha a versão de `public/platform-release.json` e não inclui o banco particular.

## 6. Preservar uma nova entrega

Registre o commit utilizado, versões dos componentes, resultados dos testes e hashes dos arquivos distribuídos. Mantenha o `package-lock.json`, as partes dos dados públicos e os scripts de build junto do código.

Os workflows de GitHub Actions podem ser executados manualmente em **Actions → Run workflow**. Os instaladores de CI têm retenção de 14 dias; recompilações futuras usam os fontes preservados. Guarde os instaladores distribuídos e os backups da base no armazenamento particular adequado.

Mantenha segredos, diretórios de assinatura, cadastros, cópias protegidas da base e arquivos de recuperação fora do repositório. A rotina de publicação não é executada pelos workflows de testes.

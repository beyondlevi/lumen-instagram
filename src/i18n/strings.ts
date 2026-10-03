// Every user-facing string lives in this file. English is the default;
// Portuguese (pt-BR copy) is chosen for any `pt-*` browser language, including
// the glasses' pt-PT. Counted strings have `_one` and `_other` forms.

const en = {
  appName: 'Instagram',

  tabReels: 'Reels',
  tabDirect: 'Direct',
  sectionsLabel: 'Instagram sections',
  reelsLabel: 'Reels',
  inboxLabel: 'Direct messages',

  loadingHeader: 'Loading…',
  loadingLabel: 'Loading',
  retry: 'Try again',
  checkAgain: 'Check again',
  emptyLabel: 'Nothing to show',

  setupHeader: 'Set up',
  setupLabel: 'Setup required',
  setupTitle: 'Connect your bridge',
  setupBody:
    'Instagram for Lumen talks to Instagram through a bridge you run at home. Open Rokid Lumen on your phone, go to Apps, Instagram, and fill in its address and key.',
  setupMissingLabel: 'MISSING',
  setupStillMissing: 'Still missing',
  fieldUrl: 'Bridge URL',
  fieldKey: 'Bridge key',
  invalidUrlTitle: 'That bridge address looks wrong',
  invalidUrlBody: 'Use the full https:// address of your bridge, with nothing after the path.',
  invalidKeyTitle: 'That bridge key looks wrong',
  invalidKeyBody: 'The key is the BRIDGE_KEY your bridge runs with: 24 characters or more, no spaces.',
  badKeyTitle: 'The bridge refused the key',
  badKeyBody: 'The key on your phone does not match the bridge. Copy BRIDGE_KEY again into Rokid Lumen, Apps, Instagram.',
  loginTitle: 'Sign in on your bridge',
  loginBody:
    'Instagram ended the session. Copy a new sessionid cookie from instagram.com and run the bridge sign-in again.',
  challengeTitle: 'Confirm it is you',
  challengeBody: 'Instagram paused this session. Approve the sign-in in Instagram on your phone, then try again.',

  errorHeader: 'Instagram',
  errorLabel: 'Error',
  errNetworkTitle: "Can't reach your bridge",
  errNetworkBody: 'Check that the bridge and its tunnel are running, and the internet connection.',
  errTimeoutTitle: 'The bridge is taking too long',
  errTimeoutBody: 'Try again in a moment.',
  errRateTitle: 'Too many requests',
  errRateBody: 'Instagram asked to slow down. Try again in {time}.',
  errBlockedTitle: 'Instagram refused this',
  errBlockedBody: 'Instagram blocked the action for now. Try it later in the Instagram app.',
  errNotFoundTitle: 'Not found',
  errNotFoundBody: 'Instagram says this no longer exists.',
  errServerTitle: 'Instagram is not answering',
  errServerBody: 'Try again in a moment.',
  httpStatus: 'HTTP {status}',
  errorDetailLabel: 'DETAIL',

  reasonNetwork: 'no connection to the bridge',
  reasonTimeout: 'the bridge took too long',
  reasonSession: 'session ended',
  reasonRate: 'too many requests',
  reasonBlocked: 'Instagram refused it',
  reasonNotFound: 'not found',
  reasonAudio: "the bridge couldn't read the audio",
  reasonServer: 'Instagram error',
  reasonFormat: 'unsupported format',

  reelsEmptyTitle: 'No reels',
  reelsEmptyBody: 'Instagram sent no reels right now.',
  reelLabel: 'Reel by {author}',
  reelPlaying: 'Playing. Enter pauses and shows actions.',
  reelPaused: 'Paused. Enter plays.',
  reelFailed: "Couldn't play this reel",
  reelFailedBody: 'Move down for the next one.',
  reelLoading: 'Loading reel',
  originalAudio: 'Original audio',
  nextHint: 'Next',
  soundOffHint: 'Sound off',
  likeAction: 'Like',
  unlikeAction: 'Unlike',
  likeCountHidden: 'Likes hidden',
  likesLabel_one: '{count} like',
  likesLabel_other: '{count} likes',
  commentsAction: 'Comments',
  commentsCount_one: '{count} comment',
  commentsCount_other: '{count} comments',
  sendAction: 'Send',
  saveAction: 'Save',
  unsaveAction: 'Remove from saved',
  soundOnAction: 'Sound on',
  soundOffAction: 'Sound off',
  positionLabel: 'Position',
  liked: 'Liked',
  unliked: 'Like removed',
  saved: 'Saved',
  unsaved: 'Removed from saved',
  likeFailed: 'Like not sent: {reason}',
  saveFailed: 'Not saved: {reason}',

  commentsHeader: 'Comments',
  commentsLabel: 'Comments',
  noCommentsTitle: 'No comments yet',
  noCommentsBody: 'No one has commented on this reel.',
  commentsOffTitle: 'Comments are off',
  commentsOffBody: 'The owner turned comments off for this reel.',
  commentLabel: 'Comment by {author}',
  repliesCount_one: '{count} reply',
  repliesCount_other: '{count} replies',

  sendHeader: 'Send to',
  sendLabel: 'Conversations to send the reel to',
  sentTo: 'Sent to {name}',
  sentSubtitle: 'Sent',
  shareFailed: 'Not sent: {reason}',
  noThreadsTitle: 'No conversations',
  noThreadsBody: 'Your Direct conversations show up here.',

  directEmptyTitle: 'No messages',
  directEmptyBody: 'Your Direct conversations show up here.',
  you: 'You',
  senderPrefix: '{sender}: {text}',
  unknownContact: 'Instagram user',
  groupMembers_one: '{count} person',
  groupMembers_other: '{count} people',

  threadLabel: 'Conversation with {name}',
  threadEmptyTitle: 'No messages yet',
  threadEmptyBody: 'Say hello with Reply or Voice.',
  replyAction: 'Reply',
  voiceAction: 'Voice',
  replyHint: 'Write a message',
  replyFieldLabel: 'Message to {name}',
  sendLabelButton: 'Send',
  sendingLabel: 'Sending',
  messageSent: 'Message sent',
  sendFailed: 'Not sent: {reason}',
  messageActionsLabel: 'Message: {message}',
  bubbleLabel: '{sender}: {text}, {time}',
  reactWith: 'React with {emoji}',
  reactionSent: 'Reacted {emoji}',
  reactionRemoved: 'Reaction removed',
  reactionFailed: 'Reaction not sent: {reason}',
  reactionsLabel: 'Reactions: {list}',
  playAction: 'Play',
  viewAction: 'View',
  listenAction: 'Listen',
  pauseAction: 'Pause',
  transcribeAction: 'Transcribe',
  transcribeUnavailable: 'Transcribe needs a newer Rokid Lumen',

  markerReel: 'Reel',
  markerReelBy: 'Reel by {author}',
  markerPost: 'Post',
  markerPostBy: 'Post by {author}',
  markerPhoto: 'Photo',
  markerVideo: 'Video',
  markerVoice: 'Voice message',
  markerStory: 'Story',
  markerEphemeral: 'Photo or video to view once',
  markerGif: 'GIF',
  markerUnsupported: 'Open Instagram to see this message',
  markerLike: '❤️',
  markerWithCaption: '{marker}: {caption}',
  markerNoPreview: 'No messages yet',

  audioLabel: 'Voice message, {duration}',
  audioPlaying: 'Playing, {position} of {duration}',
  audioPaused: 'Paused at {position} of {duration}',
  audioLoading: 'Loading voice message',
  audioFailed: "Couldn't play: {reason}",

  recordingHeader: 'Voice message',
  recordingLabel: 'Recording a voice message',
  recordingStarting: 'Starting the microphone…',
  recordingNow: 'Recording. Send when you are done.',
  recordingLimit: 'Reached {limit}. Send or discard.',
  recordingFinishing: 'Finishing…',
  recordingSending: 'Sending…',
  recordingLevel: 'Microphone level',
  recordingFailedTitle: "Couldn't record",
  sendVoiceAction: 'Send',
  discardAction: 'Discard',
  voiceSent: 'Voice message sent',
  voiceFailed: 'Voice message not sent: {reason}',

  transcriptHeader: 'Transcript',
  transcriptLabel: 'Transcript of a voice message from {name}',
  transcribing: 'Transcribing…',
  transcriptEmpty: '(no speech)',
  transcriptFailedTitle: "Couldn't transcribe",

  audioBusy: 'The microphone is busy with another recording or dictation.',
  audioNoPhone: 'The phone is not connected.',
  audioUnavailable: "The phone couldn't use the glasses' microphone.",
  audioTooLarge: 'The audio is too long to transcribe.',
  audioUnsupported: "This audio format can't be transcribed.",
  audioNoSpeech: 'No speech was heard.',
  audioTimeout: 'The phone stopped answering.',
  audioEngine: 'Dictation engine: {message}',
  audioOther: 'Audio error: {message}',

  sharedHeader: 'From {name}',
  sharedReactHeart: 'React with a heart',
  sharedReactLaugh: 'React with laughter',

  openingLabel: 'Opening the conversation',

  yesterday: 'Yesterday',
  durationMinutes_one: '{count} minute',
  durationMinutes_other: '{count} minutes',
  durationSeconds_one: '{count} second',
  durationSeconds_other: '{count} seconds',
};

export type StringKey = keyof typeof en;
type Strings = Record<StringKey, string>;

const pt: Strings = {
  appName: 'Instagram',

  tabReels: 'Reels',
  tabDirect: 'Direct',
  sectionsLabel: 'Seções do Instagram',
  reelsLabel: 'Reels',
  inboxLabel: 'Mensagens do Direct',

  loadingHeader: 'Carregando…',
  loadingLabel: 'Carregando',
  retry: 'Tentar de novo',
  checkAgain: 'Verificar de novo',
  emptyLabel: 'Nada para mostrar',

  setupHeader: 'Configurar',
  setupLabel: 'É preciso configurar',
  setupTitle: 'Conecte sua ponte',
  setupBody:
    'O Instagram para Lumen fala com o Instagram por uma ponte que roda na sua casa. Abra o Rokid Lumen no celular, vá em Apps, Instagram, e preencha o endereço e a chave dela.',
  setupMissingLabel: 'FALTA',
  setupStillMissing: 'Ainda falta',
  fieldUrl: 'Endereço da ponte',
  fieldKey: 'Chave da ponte',
  invalidUrlTitle: 'Esse endereço da ponte parece errado',
  invalidUrlBody: 'Use o endereço https:// completo da ponte, sem nada depois do caminho.',
  invalidKeyTitle: 'Essa chave da ponte parece errada',
  invalidKeyBody: 'A chave é o BRIDGE_KEY com que a ponte roda: 24 caracteres ou mais, sem espaços.',
  badKeyTitle: 'A ponte recusou a chave',
  badKeyBody: 'A chave do celular não confere com a da ponte. Copie o BRIDGE_KEY de novo no Rokid Lumen, Apps, Instagram.',
  loginTitle: 'Entre de novo na ponte',
  loginBody:
    'O Instagram encerrou a sessão. Copie um novo cookie sessionid do instagram.com e rode o login da ponte de novo.',
  challengeTitle: 'Confirme que é você',
  challengeBody: 'O Instagram pausou esta sessão. Aprove o login no Instagram do celular e tente de novo.',

  errorHeader: 'Instagram',
  errorLabel: 'Erro',
  errNetworkTitle: 'Sem acesso à ponte',
  errNetworkBody: 'Verifique se a ponte e o túnel estão rodando, e a conexão com a internet.',
  errTimeoutTitle: 'A ponte está demorando',
  errTimeoutBody: 'Tente de novo daqui a pouco.',
  errRateTitle: 'Pedidos demais',
  errRateBody: 'O Instagram pediu para ir mais devagar. Tente de novo em {time}.',
  errBlockedTitle: 'O Instagram recusou',
  errBlockedBody: 'O Instagram bloqueou a ação por enquanto. Tente mais tarde no app do Instagram.',
  errNotFoundTitle: 'Não encontrado',
  errNotFoundBody: 'O Instagram diz que isto não existe mais.',
  errServerTitle: 'O Instagram não está respondendo',
  errServerBody: 'Tente de novo daqui a pouco.',
  httpStatus: 'HTTP {status}',
  errorDetailLabel: 'DETALHE',

  reasonNetwork: 'sem conexão com a ponte',
  reasonTimeout: 'a ponte demorou demais',
  reasonSession: 'sessão encerrada',
  reasonRate: 'pedidos demais',
  reasonBlocked: 'o Instagram recusou',
  reasonNotFound: 'não encontrado',
  reasonAudio: 'a ponte não conseguiu ler o áudio',
  reasonServer: 'erro do Instagram',
  reasonFormat: 'formato não suportado',

  reelsEmptyTitle: 'Nenhum reel',
  reelsEmptyBody: 'O Instagram não mandou reels agora.',
  reelLabel: 'Reel de {author}',
  reelPlaying: 'Tocando. Enter pausa e mostra as ações.',
  reelPaused: 'Pausado. Enter toca.',
  reelFailed: 'Não foi possível tocar este reel',
  reelFailedBody: 'Desça para o próximo.',
  reelLoading: 'Carregando o reel',
  originalAudio: 'Áudio original',
  nextHint: 'Próximo',
  soundOffHint: 'Sem som',
  likeAction: 'Curtir',
  unlikeAction: 'Descurtir',
  likeCountHidden: 'Curtidas ocultas',
  likesLabel_one: '{count} curtida',
  likesLabel_other: '{count} curtidas',
  commentsAction: 'Comentários',
  commentsCount_one: '{count} comentário',
  commentsCount_other: '{count} comentários',
  sendAction: 'Enviar',
  saveAction: 'Salvar',
  unsaveAction: 'Remover dos salvos',
  soundOnAction: 'Ligar o som',
  soundOffAction: 'Desligar o som',
  positionLabel: 'Posição',
  liked: 'Curtido',
  unliked: 'Curtida removida',
  saved: 'Salvo',
  unsaved: 'Removido dos salvos',
  likeFailed: 'Curtida não enviada: {reason}',
  saveFailed: 'Não salvo: {reason}',

  commentsHeader: 'Comentários',
  commentsLabel: 'Comentários',
  noCommentsTitle: 'Nenhum comentário',
  noCommentsBody: 'Ninguém comentou neste reel ainda.',
  commentsOffTitle: 'Comentários desativados',
  commentsOffBody: 'O dono desativou os comentários deste reel.',
  commentLabel: 'Comentário de {author}',
  repliesCount_one: '{count} resposta',
  repliesCount_other: '{count} respostas',

  sendHeader: 'Enviar para',
  sendLabel: 'Conversas para enviar o reel',
  sentTo: 'Enviado para {name}',
  sentSubtitle: 'Enviado',
  shareFailed: 'Não enviado: {reason}',
  noThreadsTitle: 'Nenhuma conversa',
  noThreadsBody: 'Suas conversas do Direct aparecem aqui.',

  directEmptyTitle: 'Nenhuma mensagem',
  directEmptyBody: 'Suas conversas do Direct aparecem aqui.',
  you: 'Você',
  senderPrefix: '{sender}: {text}',
  unknownContact: 'Usuário do Instagram',
  groupMembers_one: '{count} pessoa',
  groupMembers_other: '{count} pessoas',

  threadLabel: 'Conversa com {name}',
  threadEmptyTitle: 'Nenhuma mensagem ainda',
  threadEmptyBody: 'Diga oi com Responder ou Voz.',
  replyAction: 'Responder',
  voiceAction: 'Voz',
  replyHint: 'Escreva uma mensagem',
  replyFieldLabel: 'Mensagem para {name}',
  sendLabelButton: 'Enviar',
  sendingLabel: 'Enviando',
  messageSent: 'Mensagem enviada',
  sendFailed: 'Não enviada: {reason}',
  messageActionsLabel: 'Mensagem: {message}',
  bubbleLabel: '{sender}: {text}, {time}',
  reactWith: 'Reagir com {emoji}',
  reactionSent: 'Reagiu {emoji}',
  reactionRemoved: 'Reação removida',
  reactionFailed: 'Reação não enviada: {reason}',
  reactionsLabel: 'Reações: {list}',
  playAction: 'Assistir',
  viewAction: 'Ver',
  listenAction: 'Ouvir',
  pauseAction: 'Pausar',
  transcribeAction: 'Transcrever',
  transcribeUnavailable: 'Transcrever precisa de um Rokid Lumen mais novo',

  markerReel: 'Reel',
  markerReelBy: 'Reel de {author}',
  markerPost: 'Post',
  markerPostBy: 'Post de {author}',
  markerPhoto: 'Foto',
  markerVideo: 'Vídeo',
  markerVoice: 'Mensagem de voz',
  markerStory: 'Story',
  markerEphemeral: 'Foto ou vídeo de visualização única',
  markerGif: 'GIF',
  markerUnsupported: 'Abra o Instagram para ver esta mensagem',
  markerLike: '❤️',
  markerWithCaption: '{marker}: {caption}',
  markerNoPreview: 'Nenhuma mensagem ainda',

  audioLabel: 'Mensagem de voz, {duration}',
  audioPlaying: 'Tocando, {position} de {duration}',
  audioPaused: 'Pausada em {position} de {duration}',
  audioLoading: 'Carregando a mensagem de voz',
  audioFailed: 'Não foi possível tocar: {reason}',

  recordingHeader: 'Mensagem de voz',
  recordingLabel: 'Gravando uma mensagem de voz',
  recordingStarting: 'Ligando o microfone…',
  recordingNow: 'Gravando. Envie quando terminar.',
  recordingLimit: 'Chegou a {limit}. Envie ou descarte.',
  recordingFinishing: 'Finalizando…',
  recordingSending: 'Enviando…',
  recordingLevel: 'Nível do microfone',
  recordingFailedTitle: 'Não foi possível gravar',
  sendVoiceAction: 'Enviar',
  discardAction: 'Descartar',
  voiceSent: 'Mensagem de voz enviada',
  voiceFailed: 'Mensagem de voz não enviada: {reason}',

  transcriptHeader: 'Transcrição',
  transcriptLabel: 'Transcrição de uma mensagem de voz de {name}',
  transcribing: 'Transcrevendo…',
  transcriptEmpty: '(sem fala)',
  transcriptFailedTitle: 'Não foi possível transcrever',

  audioBusy: 'O microfone está ocupado com outra gravação ou ditado.',
  audioNoPhone: 'O celular não está conectado.',
  audioUnavailable: 'O celular não conseguiu usar o microfone dos óculos.',
  audioTooLarge: 'O áudio é longo demais para transcrever.',
  audioUnsupported: 'Este formato de áudio não pode ser transcrito.',
  audioNoSpeech: 'Nenhuma fala foi ouvida.',
  audioTimeout: 'O celular parou de responder.',
  audioEngine: 'Motor de ditado: {message}',
  audioOther: 'Erro de áudio: {message}',

  sharedHeader: 'De {name}',
  sharedReactHeart: 'Reagir com um coração',
  sharedReactLaugh: 'Reagir com risada',

  openingLabel: 'Abrindo a conversa',

  yesterday: 'Ontem',
  durationMinutes_one: '{count} minuto',
  durationMinutes_other: '{count} minutos',
  durationSeconds_one: '{count} segundo',
  durationSeconds_other: '{count} segundos',
};

const dictionaries = {en, pt} satisfies Record<string, Strings>;
export type Locale = keyof typeof dictionaries;

/** Picks the dictionary from the base language (`pt-PT` and `pt-BR` both map to `pt`). */
export function resolveLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (base in dictionaries) {
      return base as Locale;
    }
  }
  return 'en';
}

function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return navigator.language ? [navigator.language] : [];
}

const deviceLocale: Locale = resolveLocale(browserLanguages());

/** Language in use: the device's, or English while demo mode forces it. */
export let locale: Locale = deviceLocale;

/** Forces a language (demo mode) or, with null, goes back to the device's. */
export function setLocaleOverride(next: Locale | null): void {
  locale = next ?? deviceLocale;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
}

type Params = Record<string, string | number>;

function fill(template: string, params?: Params): string {
  if (params == null) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function translate(target: Locale, key: StringKey, params?: Params): string {
  return fill(dictionaries[target][key], params);
}

export function t(key: StringKey, params?: Params): string {
  return translate(locale, key, params);
}

/** Keys that have `_one`/`_other` forms, without the suffix. */
export type PluralKey = {
  [K in StringKey]: K extends `${infer Base}_one` ? (`${Base}_other` extends StringKey ? Base : never) : never;
}[StringKey];

export function translatePlural(target: Locale, key: PluralKey, count: number, params?: Params): string {
  const form = new Intl.PluralRules(target).select(count) === 'one' ? 'one' : 'other';
  return translate(target, `${key}_${form}` as StringKey, {count: formatCount(count, target), ...params});
}

/** A counted string: `tp('commentsCount', 3)` → "3 comments". */
export function tp(key: PluralKey, count: number, params?: Params): string {
  return translatePlural(locale, key, count, params);
}

/** 1234 → "1.2K" (en) / "1,2 mil" (pt). */
export function formatCount(count: number, target: Locale = locale): string {
  return new Intl.NumberFormat(target === 'pt' ? 'pt-BR' : 'en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(count);
}

/** Every dictionary, for the tests that check they have the same keys. */
export const allDictionaries = dictionaries;

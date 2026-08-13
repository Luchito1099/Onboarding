// Contenido inicial. Sólo se inserta la primera vez (cuando la base está vacía).
// Después, la fuente de verdad es SQLite: editar aquí no altera datos existentes.

export const TASKS = [
  {time:'08:45',block:'Apertura',range:'08:45–08:50',tag:'PEDIDOS',prio:'crit',dur:'5 min',
   title:'Enviar mensaje predeterminado de pedidos',
   desc:'Enviar el mensaje predeterminado de todos los pedidos que falten de Shopify (web) a WhatsApp. Suelen ser los de la madrugada y del mismo día. Toma de 1 a 5 min según la cantidad.',
   steps:['Abrir Telegram','Hacer clic o copiar el mensaje predeterminado','Enviar el mensaje al WhatsApp del cliente'],
   tips:[
     {t:'info',x:'Si el pedido es de Lima y está dentro de la cobertura de FenFung, indicar entrega el mismo día — siempre que entre antes de las 10:50 am.'},
     {t:'warn',x:'Si hay varios pedidos de Lima para el mismo día sin registrar, hacerlo con 30–40 min de anticipación al cierre de Delivery Normal FenFung (cierra 11:00 am).'},
     {t:'alert',x:'Pedidos de Lima del mismo día o del día anterior sin registrar: máximo hasta las 10:55 am. A las 11:00 am se cierra el sistema de Delivery Normal.'}
   ]},
  {time:'08:50',block:'Apertura',range:'08:50–09:10',tag:'SEGUIMIENTO',prio:'crit',dur:'20 min',
   title:'Etiquetado & seguimiento de pedidos',
   desc:'Etiquetar cada pedido según su estado y dar seguimiento a los pendientes de confirmar o de despacho.',
   steps:['Revisar la bandeja de pedidos nuevos','Etiquetar por estado (nuevo / confirmado / despachado)','Marcar los que requieren seguimiento hoy'],
   tips:[{t:'info',x:'Usa siempre la misma etiqueta por estado para no romper el filtro del CRM.'}]},
  {time:'09:10',block:'Mañana',range:'09:10–10:30',tag:'CONFIRMAR',prio:'imp',dur:'80 min',
   title:'Confirmar pedidos por WhatsApp',
   desc:'Escribir o llamar a los leads del día para confirmar pedido, dirección y talla antes del despacho.',
   steps:['Abrir el embudo de confirmaciones','Confirmar datos y talla del cliente','Mover a "confirmado" o "cliente falla"'],
   tips:[{t:'warn',x:'La talla se confirma SIEMPRE por WhatsApp, nunca se asume.'},{t:'alert',x:'Si el cliente ya falló 2+ entregas, exigir prepago total antes de despachar.'}]},
  {time:'10:40',block:'Cierre delivery',range:'10:40–11:00',tag:'DESPACHO',prio:'crit',dur:'20 min',
   title:'Registrar pedidos antes del cierre FenFung',
   desc:'Registrar en Delivery Normal todos los pedidos de Lima confirmados antes de que cierre a las 11:00 am.',
   steps:['Filtrar pedidos de Lima confirmados','Registrar en el sistema de Delivery Normal','Verificar que quedaron todos antes de las 11:00 am'],
   tips:[{t:'alert',x:'11:00 am es el corte duro. Nada entra después.'}]}
];

export const VIDEOS = [
  {title:'Bienvenida + cómo funciona el COD y tu rol',type:'Tú hablando a cámara',dur:'5:00',guion:'Preséntate y explica qué vendemos, qué es el pago contra entrega (COD) y por qué la vendedora es la pieza que hace que el pedido llegue y se cobre. Cierra con la actitud que esperas: rapidez, orden y honestidad.'},
  {title:'Tour de tus herramientas',type:'Grabación de pantalla',dur:'6:00',guion:'Muestra en pantalla, en un recorrido: Shopify, Telegram, WhatsApp, el CRM y el sistema de Delivery Normal. Solo el panorama; el detalle va en cada proceso.'},
  {title:'Enviar el mensaje predeterminado Shopify → WhatsApp',type:'Grabación de pantalla',dur:'2:00',guion:'Haz el proceso real una vez: abre Telegram, copia el predeterminado y envíalo. Narra en voz alta. No edites.'},
  {title:'Confirmar pedido y talla por WhatsApp',type:'Grabación de pantalla',dur:'3:00',guion:'Muestra cómo confirmas datos, dirección y talla, y cómo mueves el pedido a "confirmado". Recalca que la talla nunca se asume.'},
  {title:'Registrar en Delivery Normal antes del cierre FenFung',type:'Grabación de pantalla',dur:'3:00',guion:'Muestra cómo filtras y registras los pedidos de Lima. Insiste en el corte de las 11:00 am.'},
  {title:'Etiquetar y dar seguimiento',type:'Grabación de pantalla',dur:'2:00',guion:'Muestra cómo etiquetas por estado y marcas los que necesitan seguimiento.'}
];

export const CHECKLIST = [
  {day:'Día 1',items:['Ver los 6 videos de lanzamiento en orden','Tener accesos: WhatsApp, Telegram, Shopify, CRM y Delivery Normal','Ver los ejemplos reales de chats y llamadas']},
  {day:'Día 2',items:['Acompañar y observar una mañana real completa','Registrar 3 pedidos reales con apoyo']},
  {day:'Día 3',items:['Operar sola con el Runbook diario abierto','Cerrar el día con revisión rápida']}
];

export const PROCESOS = [
  {name:'Enviar mensaje predeterminado Shopify → WhatsApp',when:'Apertura · cada mañana',
   steps:['Abrir Telegram','Copiar el mensaje predeterminado','Enviar al WhatsApp del cliente','Registrar el envío'],
   tips:[{t:'info',x:'Prioriza los pedidos de Lima del mismo día por el corte de las 11:00 am.'}]},
  {name:'Confirmar pedido y talla por WhatsApp',when:'En cada confirmación',
   steps:['Contactar por WhatsApp','Confirmar nombre, dirección y distrito','Confirmar la talla exacta','Mover a "confirmado"'],
   tips:[{t:'warn',x:'La talla se confirma siempre, nunca se asume.'}]},
  {name:'Manejo de "cliente falla" (prepago)',when:'Cliente con 2+ entregas fallidas',
   steps:['Marcar el campo "prepago requerido"','Solicitar el adelanto del total','No despachar hasta registrar el pago'],
   tips:[{t:'alert',x:'2 entregas fallidas acumuladas = prepago total, sin excepción.'}]},
  {name:'Registrar pedido de Lima en Delivery Normal (FenFung)',when:'Pedidos de Lima · antes de 11:00 am',
   steps:['Filtrar Lima confirmados','Ingresar los datos en el sistema','Confirmar que el registro fue exitoso'],
   tips:[{t:'alert',x:'Corte duro 11:00 am. Registra con anticipación.'}]},
  {name:'Enviar pedido de provincia (adelanto S/30)',when:'Todo pedido de provincia',
   steps:['Informar el adelanto de S/30','Registrar el pago del adelanto','Generar guía del courier','Enviar el número de seguimiento'],
   tips:[{t:'warn',x:'Sin adelanto confirmado no se genera la guía.'}]},
  {name:'Etiquetar y dar seguimiento',when:'Apertura y durante el día',
   steps:['Revisar pedidos nuevos','Etiquetar por estado','Marcar los que requieren seguimiento hoy'],
   tips:[{t:'info',x:'Misma etiqueta por estado = filtros del CRM intactos.'}]}
];

export const PRODUCTS = [
  {id:'tobillera',name:'Tobillera de compresión NOVAFLEX®',brand:'NOVAFLEX®',price:'S/69 – S/129',
   desc:'Soporte de compresión para el tobillo que da estabilidad y firmeza sin limitar el movimiento. Se usa entrenando, trabajando de pie o en la rutina diaria.',
   packs:[{q:'1 unidad',p:'S/69'},{q:'2 unidades',p:'S/99',best:true},{q:'3 unidades',p:'S/129'}],
   beneficios:['Mayor estabilidad en cada movimiento','Ultra ligera — solo 1 mm, no abulta','Se lleva bajo cualquier calzado','Talla única ajustable','Tejido transpirable, no irrita'],
   specs:[{k:'Grosor',v:'1 mm'},{k:'Material',v:'Tejido elástico transpirable con panel de compresión'},{k:'Talla',v:'Única ajustable'},{k:'Colores',v:'Negro/gris · Negro/verde'}],
   objeciones:[
     {o:'Está muy caro',r:'Recuérdale que es pago contra entrega: paga recién al recibir, sin riesgo. Y en pack de 2 o 3, el precio por unidad baja bastante.'},
     {o:'No sé si me quede bien',r:'Es talla única ajustable, se adapta a la mayoría de tallas de pie/tobillo. Si usa calzado normal, le va a quedar.'},
     {o:'¿Aprieta demasiado?',r:'Da compresión firme pero ajustable; no corta la circulación. Se siente como soporte, no como una venda apretada.'},
     {o:'Lo voy a pensar',r:'No presiones. Pregunta: "¿Qué te hace dudar — la talla, el precio o el envío?" y resuelve esa duda puntual.'},
     {o:'¿Sirve para hacer deporte?',r:'Sí, ideal para correr, fútbol, básquet y cualquier actividad de impacto. Da soporte sin limitar el movimiento.'}
   ],
   argumentos:'Vende el resultado, no el producto: "vuelve a moverte con seguridad". Enfócate en soporte, estabilidad y firmeza — nunca prometas curar lesiones ni uses "protección médica".'},
  {id:'rodillera',name:'Rodillera de soporte NOVAFLEX®',brand:'NOVAFLEX®',price:'S/75 – S/135',
   desc:'Soporte de compresión para la rodilla que aporta estabilidad y firmeza en el movimiento, para entrenar o para el día a día.',
   packs:[{q:'1 unidad',p:'S/75'},{q:'2 unidades',p:'S/109',best:true},{q:'3 unidades',p:'S/135'}],
   beneficios:['Estabilidad en la rodilla al moverse','Compresión firme y transpirable','Se adapta al uso diario o deportivo','Talla única ajustable'],
   specs:[{k:'Material',v:'Tejido elástico transpirable'},{k:'Talla',v:'Única ajustable'},{k:'Colores',v:'Negro'}],
   objeciones:[
     {o:'Está caro',r:'Pago contra entrega, paga al recibir. En pack sale más conveniente.'},
     {o:'¿Me quedará?',r:'Talla única ajustable, se adapta a la mayoría.'},
     {o:'Lo voy a pensar',r:'Pregunta qué le hace dudar (talla, precio o envío) y resuelve esa duda.'}
   ],
   argumentos:'Mismo enfoque que la tobillera: soporte y estabilidad, no promesas médicas.'}
];

export const INFOS = [
  {title:'Qué vendemos y a quién',tag:'Negocio',
   body:'NOVAFLEX® vende soportes de compresión (tobillera, rodillera) por pago contra entrega en Lima y provincias.\n\nEl cliente típico llega por anuncio, pregunta por WhatsApp y decide en la misma conversación. Nadie paga por adelantado en Lima: paga cuando el producto llega a su puerta.',
   links:[]},
  {title:'Cómo funciona el pago contra entrega (COD)',tag:'Negocio',
   body:'El cliente paga al recibir. Eso baja el riesgo percibido y es nuestro mejor argumento frente al **precio**.\n\nLima: sin adelanto, entrega por FenFung.\nProvincia: adelanto de S/30 que se descuenta del total, envío por courier con número de seguimiento.',
   links:[]},
  {title:'Horarios y cortes del día',tag:'Operación',
   body:'**11:00 am** es el corte duro de Delivery Normal (FenFung) para pedidos de Lima del mismo día. Todo lo que no entró antes, sale al día siguiente.\n\nRegistra con 30–40 min de anticipación cuando hay varios pedidos.',
   links:[]},
  {title:'Reglas que no se negocian',tag:'Reglas',
   body:'1. La talla se confirma **siempre** por WhatsApp, nunca se asume.\n2. Cliente con 2+ entregas fallidas: prepago total, sin excepción.\n3. Sin adelanto confirmado no se genera la guía de provincia.\n4. Nunca prometemos curar lesiones ni usamos la frase _protección médica_.',
   links:[]},
];

export const EJEMPLOS = [
  {kind:'chat',title:'Cliente dice "está caro"',obj:'Objeción: precio',dur:'6 mensajes',desc:'Cómo bajar el precio percibido usando el pago contra entrega.',
   chat:[{s:'in',w:'Cliente',t:'Hola, me interesa la tobillera pero está un poco cara 😅'},{s:'out',w:'Vendedora',t:'¡Hola! Te entiendo 🙌 Justo lo bueno es que es pago contra entrega: pagas recién cuando lo recibes en tu puerta, sin riesgo.'},{s:'in',w:'Cliente',t:'Ah no sabía que era contra entrega'},{s:'out',w:'Vendedora',t:'Así es 👍 Y si llevas el pack de 2 te sale más económico por unidad. ¿Te muestro?'},{s:'in',w:'Cliente',t:'Ya pues, muéstrame el de 2'},{s:'out',w:'Vendedora',t:'Perfecto, el pack de 2 queda en S/99 con envío. ¿A qué distrito te lo envío?'}],
   learn:'Nunca defiendas el precio de frente. Cambia el foco al <b>pago contra entrega</b> (baja el riesgo) y ofrece el pack como alternativa, no como presión.'},
  {kind:'chat',title:'Cliente dice "lo voy a pensar"',obj:'Objeción: duda',dur:'5 mensajes',desc:'Cómo descubrir la objeción real sin presionar.',
   chat:[{s:'in',w:'Cliente',t:'Gracias, lo voy a pensar'},{s:'out',w:'Vendedora',t:'¡Claro! Solo para ayudarte mejor 😊 ¿Qué es lo que te hace dudar — la talla, el precio o el envío?'},{s:'in',w:'Cliente',t:'Más que nada si me va a quedar'},{s:'out',w:'Vendedora',t:'Tranquila, es talla única ajustable, se adapta a la mayoría de tallas de tobillo. Si usas zapato normal, te va a quedar bien 👍'},{s:'in',w:'Cliente',t:'Ah ya, entonces sí, mándamelo'}],
   learn:'"Lo voy a pensar" casi nunca es un no. Pregunta <b>qué le hace dudar</b> y resuelve esa duda puntual. Aquí era la talla, no el precio.'},
  {kind:'call',title:'Confirmación de pedido de Lima',obj:'Proceso: confirmar',dur:'2:14',desc:'Llamada modelo para confirmar dirección y talla con buen tono.',
   note:'Escucha cómo la vendedora confirma nombre, dirección con referencia y talla, sin apurar al cliente. Mantiene un tono cálido y cierra confirmando el horario de entrega.',
   learn:'El ritmo importa: da tiempo a que el cliente responda, repite la dirección para confirmar, y cierra siempre con el <b>siguiente paso claro</b> (cuándo llega).'},
  {kind:'call',title:'Cliente de provincia duda del adelanto',obj:'Objeción: desconfianza',dur:'3:02',desc:'Cómo explicar el adelanto de S/30 generando confianza.',
   note:'La vendedora explica que el adelanto se descuenta del total y que apenas paga se le envía el número de seguimiento del courier. Ofrece mandar captura de otros envíos entregados.',
   learn:'Ante la desconfianza, da <b>pruebas y control</b>: el seguimiento del courier y ejemplos de entregas anteriores. El adelanto deja de sentirse como riesgo.'}
];

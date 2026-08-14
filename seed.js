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

// Onboarding: se entrega vacío a propósito. Cada equipo graba sus propios videos y
// arma su checklist desde la app; no tiene sentido arrancar con ejemplos que hay que borrar.
export const VIDEOS = [];

export const CHECKLIST = [];

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
   argumentos:'Vende el resultado, no el producto: "vuelve a moverte con seguridad". Enfócate en soporte, estabilidad y firmeza — nunca prometas curar lesiones ni uses "protección médica".',
   difTexto:'La mayoría de tobilleras del mercado son de tela gruesa: abultan, dan calor y no entran en el zapato. La nuestra es de **1 mm** con panel de compresión, así que se usa todo el día bajo cualquier calzado.',
   compara:[
     {k:'Grosor',a:'1 mm, no abulta',b:'3–5 mm, no entra en el zapato'},
     {k:'Uso diario',a:'Todo el día, transpirable',b:'Da calor a las pocas horas'},
     {k:'Talla',a:'Única ajustable',b:'Tallas fijas, difícil acertar'},
     {k:'Riesgo para el cliente',a:'Paga al recibir',b:'Pago adelantado'}
   ],
   difUrl:'',difNota:'',
   waMsg:'¡Hola [nombre]! 👋 Te escribo de Nova Shop por la *Tobillera de compresión NOVAFLEX®*.\n\n✅ Da soporte y estabilidad sin abultar (solo 1 mm, entra en cualquier zapato)\n✅ Talla única ajustable\n✅ *Pago contra entrega*: pagas recién cuando la recibes en tu puerta\n\nPrecios:\n• 1 unidad: S/69\n• 2 unidades: S/99 (la más pedida)\n• 3 unidades: S/129\n\n¿A qué distrito te la envío?'},
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

// Guiones por caso: apertura + lo que puede preguntar el cliente y qué responder.
export const GUIONES = [
  {title:'Cliente no respondió al mensaje del adelanto',tag:'Provincia',when:'Pedido de provincia · ya se le envió la info del adelanto y no contesta',
   apertura:'Hola [nombre], ¿qué tal? Te saluda [asesor] de Nova Shop.\n\nTe estoy llamando por el pedido que registraste con nosotros de [producto].',
   casos:[
     {n:'Ya le enviamos la información del adelanto y no contesta',
      t:'Hace un momento te enviamos la información para realizar el adelanto de S/30 y poder despachar tu pedido.\n\nQuería confirmar si **llegaste a realizar el adelanto**, para poder **alistarlo y enviarlo el día de hoy**.'},
     {n:'Es la primera vez que se le explica el adelanto',
      t:'Para los envíos a provincia pedimos un adelanto de S/30 que **se descuenta del total**; el resto lo pagas cuando el pedido llega a la agencia.\n\nTe paso los medios de pago por WhatsApp y, apenas me envíes el comprobante, lo dejo listo para despacho.'}
   ],
   qas:[
     {q:'Todavía no lo he hecho',
      r:'No hay problema. Si deseas que tu pedido salga en el despacho de hoy, puedes realizar el adelanto de S/30 en cualquiera de los medios que te enviamos por WhatsApp. Una vez que me envíes el comprobante, procedemos con el despacho.',
      nota:'Genera urgencia real, sin presionar demasiado.'},
     {q:'Lo voy a hacer más tarde',
      r:'Perfecto, no hay problema. Apenas realices el adelanto, envíame el comprobante por WhatsApp para poder validarlo y dejar tu pedido listo para despacho.',
      nota:''},
     {q:'¿Y cuándo pago el resto?',
      r:'El adelanto es de S/30 para poder despachar tu pedido. El saldo restante lo cancelas cuando el pedido llegue a la agencia de destino. Nosotros te avisamos cuando esté disponible y, una vez realizado el pago del saldo, te brindamos tu clave de cuatro dígitos para que puedas retirarlo.',
      nota:'Explícalo de forma muy sencilla, sin tecnicismos.'}
   ],
   cierre:'Perfecto [nombre], quedo atento a tu comprobante para dejar el pedido listo. Cualquier cosa me escribes por WhatsApp.',
   tips:[
     {t:'alert',x:'Sin adelanto confirmado no se genera la guía.'},
     {t:'info',x:'Si no contesta la llamada, déjale el mismo texto de la apertura por WhatsApp.'}
   ]},
  {title:'Cliente dice que está caro',tag:'Objeción: precio',when:'En cualquier conversación, antes de cerrar',
   apertura:'Te entiendo. Justo lo bueno es que es **pago contra entrega**: pagas recién cuando lo recibes en tu puerta, sin riesgo.',
   qas:[
     {q:'Igual me parece caro',
      r:'Lo entiendo. Si llevas el pack de 2 te sale más económico por unidad y te queda uno de repuesto. ¿Te muestro los precios?',
      nota:'No defiendas el precio de frente: cambia el foco al riesgo cero y ofrece el pack.'},
     {q:'¿No hay descuento?',
      r:'El precio ya está con el descuento de la promoción. Lo que sí puedo hacer es darte el pack de 2 al precio promocional, que te sale mejor por unidad.',
      nota:'Nunca inventes descuentos fuera de la lista de packs.'}
   ],
   cierre:'¿A qué distrito te lo envío?',
   tips:[{t:'info',x:'Cierra siempre con una pregunta que haga avanzar el pedido.'}]}
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

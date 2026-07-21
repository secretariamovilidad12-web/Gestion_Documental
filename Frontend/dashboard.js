console.log("dashboard.js cargado");

const API_URL = "https://gestion-documental-api-erbn.onrender.com";

function limpiarSesionLocal() {

    sessionStorage.removeItem("usuario");
    sessionStorage.removeItem("rol");
    sessionStorage.removeItem("id_usuario");
    sessionStorage.removeItem("id_oficina");
    sessionStorage.removeItem("token_sesion");
    sessionStorage.removeItem("ultimo_acceso");

}

function obtenerTokenSesion() {

    return String(
        sessionStorage.getItem("token_sesion") || ""
    );

}

function obtenerHeadersSesion(incluirJson = false) {

    const headers = {};

    if (incluirJson) {
        headers["Content-Type"] = "application/json";
    }

    const idUsuario =
        sessionStorage.getItem("id_usuario");

    const tokenSesion =
        obtenerTokenSesion();

    if (idUsuario) {
        headers["x-id-usuario"] = idUsuario;
    }

    if (tokenSesion) {
        headers["x-session-token"] = tokenSesion;
    }

    return headers;

}

function obtenerQuerySesion() {

    const parametros =
        new URLSearchParams();

    const idUsuario =
        sessionStorage.getItem("id_usuario");

    const tokenSesion =
        obtenerTokenSesion();

    if (idUsuario) {
        parametros.set("id_usuario", idUsuario);
    }

    if (tokenSesion) {
        parametros.set("token_sesion", tokenSesion);
    }

    return parametros.toString();

}

async function fetchAutenticado(url, opciones = {}) {

    const respuesta =
        await fetch(url, {
            ...opciones,
            headers: {
                ...(opciones.headers || {}),
                ...obtenerHeadersSesion()
            }
        });

    if (respuesta.status === 401) {
        limpiarSesionLocal();
        window.location.href = "login.html";
    }

    return respuesta;

}

function iniciarHeartbeatSesion() {

    if (window.heartbeatSesionTimer) {
        window.clearInterval(window.heartbeatSesionTimer);
    }

    window.heartbeatSesionTimer = window.setInterval(() => {
        fetchAutenticado(`${API_URL}/api/auth/heartbeat`)
            .catch((error) => {
                console.error(error);
            });
    }, 5 * 60 * 1000);

}

const usuario = sessionStorage.getItem("usuario");
const tokenSesionActivo = obtenerTokenSesion();

if (!usuario || !tokenSesionActivo) {

    limpiarSesionLocal();
    window.location.href = "login.html";

}

let contextoAudioChat = null;

function prepararAudioNotificacionChat() {

    const AudioContextChat =
        window.AudioContext || window.webkitAudioContext;

    if (!AudioContextChat) {
        return null;
    }

    if (!contextoAudioChat) {
        contextoAudioChat = new AudioContextChat();
    }

    if (contextoAudioChat.state === "suspended") {
        contextoAudioChat.resume().catch(() => { });
    }

    return contextoAudioChat;

}

function reproducirNotificacionChat() {

    const audio =
        prepararAudioNotificacionChat();

    if (!audio) {
        return;
    }

    try {

        const oscilador =
            audio.createOscillator();

        const ganancia =
            audio.createGain();

        oscilador.type = "sine";
        oscilador.frequency.setValueAtTime(880, audio.currentTime);
        ganancia.gain.setValueAtTime(0.0001, audio.currentTime);
        ganancia.gain.exponentialRampToValueAtTime(0.18, audio.currentTime + 0.02);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.22);

        oscilador.connect(ganancia);
        ganancia.connect(audio.destination);
        oscilador.start(audio.currentTime);
        oscilador.stop(audio.currentTime + 0.24);

    } catch (error) {

        console.error("No se pudo reproducir la notificacion", error);

    }

}

function inicializarNotificacionesChatGlobales() {

    if (window.chatNotificacionesEventSource) {
        return;
    }

    document.addEventListener("click", prepararAudioNotificacionChat, { once: true });
    document.addEventListener("keydown", prepararAudioNotificacionChat, { once: true });

    if (!window.EventSource) {
        return;
    }

    const eventosChat =
        new EventSource(
            `${API_URL}/api/chat/eventos?${obtenerQuerySesion()}`
        );

    window.chatNotificacionesEventSource = eventosChat;

    eventosChat.addEventListener("mensaje-creado", (evento) => {

        const mensaje =
            JSON.parse(evento.data);

        const idUsuarioActual =
            String(sessionStorage.getItem("id_usuario") || "");

        const idUsuarioMensaje =
            String(mensaje.id_usuario || mensaje.idUsuario || "");

        const rolMensaje =
            String(mensaje.id_rol || mensaje.rol || mensaje.idRol || "");

        if (
            idUsuarioMensaje &&
            idUsuarioMensaje !== idUsuarioActual &&
            (rolMensaje === "2" || rolMensaje === "4")
        ) {
            reproducirNotificacionChat();
        }

    });

    eventosChat.onerror = () => {
        window.chatNotificacionesEventSource = null;
    };

}

document.addEventListener("DOMContentLoaded", () => {

    const usuarioConectado =
        document.getElementById("usuarioConectado");

    const usuarioFooter =
        document.getElementById("usuarioFooter");

    if (usuarioConectado) {

        usuarioConectado.textContent = usuario;

    }

    if (usuarioFooter) {

        usuarioFooter.textContent = usuario;

    }

    const rol = sessionStorage.getItem("rol");
    const puedeVerFechaDevolucion =
        rol === "2" || rol === "3" || rol === "4";

    const puedeVerResponsable =
        rol === "2" || rol === "3";


    inicializarNotificacionesChatGlobales();
    iniciarHeartbeatSesion();

    const avatarIniciales =
        document.getElementById("avatarIniciales");

    const rolUsuarioTexto =
        document.getElementById("rolUsuarioTexto");

    const contenidoPrincipal =
        document.getElementById("contenidoPrincipal");

    const vistaInicioHTML =
        contenidoPrincipal.innerHTML;


    const btnInicio =
        document.getElementById("btnInicio");


    const btnChat =
        document.getElementById("btnChat");

    const idUsuarioActual =
        sessionStorage.getItem("id_usuario");

    let moduloActual = "inicio";
    let mensajesPendientesChat = 0;
    let audioChatContext = null;
    let badgeChat = null;

    if (btnChat) {
        badgeChat = document.createElement("span");
        badgeChat.id = "badgeChat";
        badgeChat.className = "badge-chat";
        badgeChat.hidden = true;
        btnChat.appendChild(badgeChat);
    }
    const rolesTexto = {
        "2": "Administrador",
        "3": "Gestor",
        "4": "Trámites"
    };

    if (avatarIniciales) {

        avatarIniciales.textContent = (usuario || "Usuario")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((nombre) => nombre.charAt(0).toUpperCase())
            .join("") || "U";

    }

    if (rolUsuarioTexto) {

        rolUsuarioTexto.textContent =
            rolesTexto[rol] || "Rol institucional";

    }

    const btnPrestamos =
        document.getElementById("btnPrestamos");

    const btnUsuarios =
        document.getElementById("btnUsuarios");

    const btnAuditoria =
        document.getElementById("btnAuditoria");

    const botonesMenu = [
        btnInicio,
        btnChat,
        btnPrestamos,
        btnUsuarios,
        btnAuditoria
    ];

    const modulos = {
        btnInicio: {
            inicio: true,
            clave: "inicio"
        },
        btnChat: {
            clave: "chat",
            etiqueta: "Chat",
            titulo: "Chat Institucional",
            texto: "Ventana para la comunicación interna del sistema.",
            vacio: "Aquí se cargará el chat institucional."
        },
        btnPrestamos: {
            clave: "prestamos",
            etiqueta: "Préstamos",
            titulo: "Préstamos",
            texto: "Ventana para consultar y registrar préstamos documentales.",
            vacio: "Aquí se cargará el módulo de préstamos."
        },
        btnUsuarios: {
            clave: "usuarios",
            etiqueta: "Usuarios",
            titulo: "Usuarios",
            texto: "Ventana para administrar usuarios del sistema.",
            vacio: "Aquí se cargará la administración de usuarios."
        },
        btnAuditoria: {
            clave: "auditoria",
            etiqueta: "Auditoría",
            titulo: "Auditoría",
            texto: "Ventana para revisar movimientos y trazabilidad del sistema.",
            vacio: "Aquí se cargará el registro de auditoría."
        }
    };

    function marcarBotonActivo(botonActivo) {

        botonesMenu.forEach((boton) => {

            if (boton) {

                boton.classList.remove("opcion-activa");

            }

        });

        botonActivo.classList.add("opcion-activa");

    }
    function actualizarBadgeChat() {

        if (!badgeChat) {
            return;
        }

        if (mensajesPendientesChat <= 0) {
            badgeChat.hidden = true;
            badgeChat.textContent = "";
            return;
        }

        badgeChat.hidden = false;
        badgeChat.textContent =
            mensajesPendientesChat > 9 ? "9+" : String(mensajesPendientesChat);

    }
    function limpiarNotificacionesChat() {

        mensajesPendientesChat = 0;
        actualizarBadgeChat();

    }

    function reproducirSonidoChat() {

        try {

            const AudioContext =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContext) {
                return;
            }

            if (!audioChatContext) {
                audioChatContext = new AudioContext();
            }

            if (audioChatContext.state === "suspended") {
                audioChatContext.resume();
            }

            const tocarTono = (frecuencia, inicio, duracion, volumen) => {

                const oscilador =
                    audioChatContext.createOscillator();

                const ganancia =
                    audioChatContext.createGain();

                oscilador.type = "triangle";
                oscilador.frequency.setValueAtTime(
                    frecuencia,
                    audioChatContext.currentTime + inicio
                );

                ganancia.gain.setValueAtTime(
                    0.0001,
                    audioChatContext.currentTime + inicio
                );
                ganancia.gain.exponentialRampToValueAtTime(
                    volumen,
                    audioChatContext.currentTime + inicio + 0.018
                );
                ganancia.gain.exponentialRampToValueAtTime(
                    0.0001,
                    audioChatContext.currentTime + inicio + duracion
                );

                oscilador.connect(ganancia);
                ganancia.connect(audioChatContext.destination);
                oscilador.start(audioChatContext.currentTime + inicio);
                oscilador.stop(audioChatContext.currentTime + inicio + duracion);

            };

            tocarTono(740, 0, 0.16, 0.28);
            tocarTono(980, 0.12, 0.2, 0.24);

        } catch (error) {

            console.warn("No fue posible reproducir sonido del chat", error);

        }

    }


    function prepararSonidoChat() {

        try {

            const AudioContext =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContext) {
                return;
            }

            if (!audioChatContext) {
                audioChatContext = new AudioContext();
            }

            if (audioChatContext.state === "suspended") {
                audioChatContext.resume();
            }

        } catch (error) {

            console.warn("No fue posible preparar sonido del chat", error);

        }

    }
    function conectarNotificacionesChat() {

        if (!window.EventSource) {
            return;
        }

        const eventosChat =
            window.chatNotificacionesEventSource ||
            new EventSource(`${API_URL}/api/chat/eventos?${obtenerQuerySesion()}`);

        window.chatNotificacionesEventSource = eventosChat;

        if (eventosChat.__badgeChatRegistrado) {
            return;
        }

        eventosChat.__badgeChatRegistrado = true;

        eventosChat.addEventListener("mensaje-creado", (evento) => {

            const mensajeNuevo =
                JSON.parse(evento.data);

            const esPropio =
                String(mensajeNuevo.id_usuario || "") === String(idUsuarioActual || "");

            if (esPropio) {
                return;
            }

            reproducirSonidoChat();

            if (moduloActual !== "chat") {
                mensajesPendientesChat += 1;
                actualizarBadgeChat();
            }
        });

        eventosChat.onerror = () => {
            window.chatNotificacionesEventSource = null;
        };

    }

    function cargarModulo(datosModulo) {

        if (!contenidoPrincipal) {
            return;
        }

        if (datosModulo.inicio) {

            contenidoPrincipal.innerHTML = vistaInicioHTML;

            return;
        }

        if (datosModulo.clave === "prestamos") {

            contenidoPrincipal.innerHTML = `

              <section class="vista-modulo modulo-prestamos">

              <p class="etiqueta-modulo">Préstamos</p>

              <h2>Control de Préstamos Documentales</h2>

              <div class="filtros-prestamos">

                <div class="campo-filtro-prestamo">

                    <label for="busquedaPlacaPrestamo">
                        Buscar placa
                    </label>

                    <input
                        id="busquedaPlacaPrestamo"
                        type="search"
                        placeholder="Ej: ABC-123"
                    >

                </div>

                <div class="campo-filtro-prestamo">

                    <label for="filtroEstadoPrestamo">
                        Estado
                    </label>

                    <select id="filtroEstadoPrestamo">

                        <option value="">
                            Todos
                        </option>

                        <option value="activo">
                            Activo
                        </option>

                        <option value="devuelto">
                            Devuelto
                        </option>

                    </select>

                </div>

            </div>

            <div class="tabla-contenedor">


            <table class="tabla-prestamos">

                <thead>

                    <tr>

                        <th>ID préstamo</th>
                        <th>Placa carpeta</th>
                        <th>Usuario solicitante</th>
                        <th>Fecha préstamo</th>
                        <th>Estado</th>
                        ${puedeVerFechaDevolucion ? `
                        <th>Fecha de devolución</th>
                        ` : ""}

                        ${puedeVerResponsable ? `
                        <th>Responsable</th>
                        ` : ""}

                    </tr>

                </thead>

                <tbody id="tablaPrestamosBody">

                    <tr>
                        <td colspan="${puedeVerFechaDevolucion ? 7 : 5}">
                            Cargando préstamos...
                        </td>
                    </tr>

                </tbody>

            </table>
            </div>

        </section>
                
        `;

            cargarPrestamosDocumentales();

            setTimeout(() => {

                document
                    .getElementById("busquedaPlacaPrestamo")
                    ?.addEventListener("input", aplicarFiltrosPrestamos);

                document
                    .getElementById("filtroEstadoPrestamo")
                    ?.addEventListener("change", aplicarFiltrosPrestamos);

            }, 300);

            return;
        }

        if (datosModulo.clave === "chat") {

            limpiarNotificacionesChat();

            contenidoPrincipal.innerHTML = `
                <section class="vista-modulo modulo-chat">

                <div class="chat-encabezado">

                    <div>

                    <p class="etiqueta-modulo">Chat</p>

                    <h2>Chat Institucional</h2>

                    <p>
                      Ventana para la comunicación interna del sistema.
                    </p>

                </div>

               <div class="acciones-chat">

                 ${rol !== "2" ? `
                 <button
                     id="btnSolicitarCarpeta"
                     class="btn-chat-principal"
                     type="button">
                     Solicitar carpeta
                 </button>
                 ` : ""}

                 <button
                 id="btnActualizarChat"
                 class="btn-chat-secundario"
                 type="button">
                 Actualizar
                </button>

            </div>

        </div>

                    <div id="estadoChat" class="estado-chat">
                        Cargando mensajes...
                    </div>

                    <div class="buscador-chat">
                        <input
                            id="busquedaChat"
                            type="search"
                            placeholder="Buscar mensaje en el chat..."
                            autocomplete="off"
                        >
                        <span id="resultadoBusquedaChat">0 mensajes</span>
                    </div>

                    <div id="listaMensajesChat" class="lista-mensajes-chat" aria-live="polite"></div>

                    <div id="menuMensajeChat" class="menu-mensaje-chat" hidden>
                        <button id="btnEliminarMensajeChat" type="button">
                            Eliminar mensaje
                        </button>
                    </div>

                    <form id="formularioChat" class="formulario-chat">
                        <textarea
                            id="mensajeChat"
                            rows="3"
                            maxlength="800"
                            placeholder="Escriba un mensaje institucional..."
                            required
                        ></textarea>

                        <button type="submit">
                            Enviar
                        </button>
                    </form>

                    <div id="modalSolicitudCarpeta" class="modal-solicitud" hidden>
                        <div class="modal-solicitud-panel">
                            <div class="modal-solicitud-header">
                                <h3>Solicitud de carpeta</h3>
                                <button id="btnCerrarModalSolicitud" type="button">×</button>
                            </div>

                            <form id="formSolicitudCarpeta" class="form-solicitud">
                                <label for="placaSolicitud">Placa</label>
                                <input
                                    id="placaSolicitud"
                                    type="text"
                                    autocomplete="off"
                                    required
                                >
                                <p
                                    id="mensajeValidacionPlaca"
                                    class="mensaje-validacion-placa"
                                    hidden
                                >
                                    La placa debe contener un guion medio (-). Ejemplo: YMK-213 o 342-GTM
                                </p>

                                <label for="motivoSolicitud">Motivo</label>
                                <select id="motivoSolicitud" required>
                                    <option value="">Seleccione un motivo</option>
                                </select>

                                <label for="observacionSolicitud">Observación</label>
                                <textarea
                                    id="observacionSolicitud"
                                    rows="3"
                                ></textarea>

                                <div class="modal-solicitud-acciones">
                                    <button id="btnCancelarSolicitud" type="button">
                                        Cancelar
                                    </button>
                                    <button type="submit">
                                        Enviar solicitud
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>

                </section>
            `;

            inicializarChatInstitucional();

            return;
        }

        if (datosModulo.clave === "usuarios") {

            contenidoPrincipal.innerHTML = `
                <section class="vista-modulo modulo-listado">
                    <p class="etiqueta-modulo">Usuarios</p>
                    <h2>Usuarios registrados</h2>
                    <p>Listado de usuarios actuales del sistema.</p>
                    <div id="estadoUsuarios" class="estado-panel" hidden></div>

                    ${rol === "2" ? `
                    <div class="tabla-contenedor tabla-panel">
                        <table class="tabla-sistema">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Usuario</th>
                                    <th>Nombre</th>
                                    <th>Correo</th>
                                    <th>Rol a asignar</th>
                                    <th>Oficina</th>
                                    <th>Fecha registro</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="tablaUsuariosPendientesBody">
                                <tr>
                                    <td colspan="8">Cargando solicitudes pendientes...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    ` : ""}

                    <div class="tabla-contenedor tabla-panel">
                        <table class="tabla-sistema">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Usuario</th>
                                    <th>Nombre</th>
                                    <th>Correo</th>
                                    <th>Rol</th>
                                    <th>Oficina</th>
                                    <th>Estado</th>
                                    <th>Ultimo acceso</th>
                                </tr>
                            </thead>
                            <tbody id="tablaUsuariosBody">
                                <tr>
                                    <td colspan="8">Cargando usuarios...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            `;

            cargarUsuariosSistema();

            if (rol === "2") {
                cargarSolicitudesRegistroPendientes();
            }

            return;
        }

        if (datosModulo.clave === "auditoria") {

            contenidoPrincipal.innerHTML = `
                <section class="vista-modulo modulo-listado">
                    <p class="etiqueta-modulo">Auditoría</p>
                    <h2>Auditoría del sistema</h2>
                    <p>Registro de cambios y acciones importantes realizadas en el sistema.</p>

                    <div class="tabla-contenedor tabla-panel">
                        <table class="tabla-sistema tabla-auditoria">
                            <thead>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Usuario</th>
                                    <th>Modulo</th>
                                    <th>Accion</th>
                                    <th>Descripcion</th>
                                    <th>Referencia</th>
                                </tr>
                            </thead>
                            <tbody id="tablaAuditoriaBody">
                                <tr>
                                    <td colspan="6">Cargando auditoría...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>
            `;

            cargarAuditoriaSistema();

            return;
        }

        contenidoPrincipal.innerHTML = `
        <section class="vista-modulo">

            <p class="etiqueta-modulo">${datosModulo.etiqueta}</p>

            <h2>${datosModulo.titulo}</h2>

            <p>${datosModulo.texto}</p>

            <div class="modulo-vacio">

                <strong>Contenido pendiente</strong>

                <span>${datosModulo.vacio}</span>

            </div>

        </section>
    `;
    }
    botonesMenu.forEach((boton) => {

        if (boton) {

            boton.addEventListener("click", () => {
                moduloActual = modulos[boton.id].clave;

                marcarBotonActivo(boton);
                cargarModulo(modulos[boton.id]);

                const menu =
                    document.querySelector(".menu-lateral");

                if (menu) {

                    menu.classList.remove("activo");

                }

            });

        }

    });

    if (rol === "4") {

        // TRÁMITES


        btnUsuarios.style.display = "none";
        btnAuditoria.style.display = "none";

    }

    if (rol === "3") {

        // GESTOR

        btnAuditoria.style.display = "none";
        btnUsuarios.style.display = "none";

    }

    if (rol === "2") {

        // ADMINISTRADOR
        // Ve todo

    }
    conectarNotificacionesChat();

    document.addEventListener("click", prepararSonidoChat, { once: true });
    document.addEventListener("keydown", prepararSonidoChat, { once: true });

});

async function cargarPrestamosDocumentales() {

    const tablaPrestamosBody =
        document.getElementById("tablaPrestamosBody");
    const rol = sessionStorage.getItem("rol");

    const puedeVerFechaDevolucion =
        rol === "2" || rol === "3" || rol === "4";

    const puedeVerResponsable =
        rol === "2" || rol === "3";

    const totalColumnas =
        puedeVerResponsable ? 7 : (puedeVerFechaDevolucion ? 6 : 5);

    if (!tablaPrestamosBody) {
        return;
    }

    try {

        tablaPrestamosBody.innerHTML = `
            <tr>
                <td colspan="${totalColumnas}">Cargando préstamos...</td>
            </tr>
        `;

        const respuesta =
            await fetchAutenticado(`${API_URL}/api/solicitudes-carpeta/prestamos`);

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudieron cargar préstamos");
        }

        window.prestamosDocumentales =
            datos.prestamos || [];

        const prestamos =
            window.prestamosDocumentales;

        tablaPrestamosBody.innerHTML = "";

        if (prestamos.length === 0) {

            tablaPrestamosBody.innerHTML = `
                <tr>
                    <td colspan="${totalColumnas}">No hay préstamos registrados</td>
                </tr>
            `;

            return;

        }

        prestamos.forEach((prestamo) => {

            const fila =
                document.createElement("tr");

            [
                prestamo.id_prestamo,
                prestamo.placa,
                prestamo.usuario_solicitante,
                new Date(prestamo.fecha_prestamo).toLocaleDateString("es-CO")
            ].forEach((valor) => {

                const celda =
                    document.createElement("td");

                celda.textContent =
                    valor || "Sin dato";

                fila.appendChild(celda);

            });

            const celdaEstado =
                document.createElement("td");

            const estado =
                document.createElement("span");

            estado.className = `estado-prestamo estado-prestamo-${String(prestamo.estado || "").toLowerCase()}`;
            estado.textContent = prestamo.estado || "proceso";
            celdaEstado.appendChild(estado);

            if (
                (sessionStorage.getItem("rol") === "3") &&
                prestamo.estado === "activo"
            ) {

                const botonDevolver =
                    document.createElement("button");

                botonDevolver.type = "button";
                botonDevolver.className = "btn-devolver-prestamo";
                botonDevolver.textContent = "Confirmar devolución";
                botonDevolver.addEventListener("click", () =>
                    confirmarDevolucionPrestamo(prestamo.id_prestamo)
                );

                celdaEstado.appendChild(botonDevolver);

            }

            fila.appendChild(celdaEstado);

            if (puedeVerFechaDevolucion) {

                const celdaFechaDevolucion =
                    document.createElement("td");

                celdaFechaDevolucion.textContent =
                    prestamo.fecha_devolucion
                        ? new Date(prestamo.fecha_devolucion)
                            .toLocaleDateString("es-CO")
                        : "-";

                fila.appendChild(celdaFechaDevolucion);

            }

            if (puedeVerResponsable) {

                const celdaResponsable =
                    document.createElement("td");

                celdaResponsable.textContent =
                    prestamo.responsable || "Sin responsable";

                fila.appendChild(celdaResponsable);

            }
            tablaPrestamosBody.appendChild(fila);

        });

    } catch (error) {

        console.error(error);

        tablaPrestamosBody.innerHTML = `
            <tr>
                <td colspan="${totalColumnas}">No fue posible cargar préstamos</td>
            </tr>
        `;

    }

}
function aplicarFiltrosPrestamos() {

    const placaBusqueda =
        document.getElementById("busquedaPlacaPrestamo")?.value
            .toLowerCase()
            .trim() || "";

    const estadoFiltro =
        document.getElementById("filtroEstadoPrestamo")?.value
            .toLowerCase()
            .trim() || "";

    const filas =
        document.querySelectorAll("#tablaPrestamosBody tr");

    filas.forEach((fila) => {

        const placa =
            fila.children[1]?.textContent
                ?.toLowerCase()
                ?.trim() || "";

        const estado =
            fila.children[4]?.textContent
                ?.toLowerCase()
                ?.trim() || "";

        const coincidePlaca =
            !placaBusqueda ||
            placa.includes(placaBusqueda);

        const coincideEstado =
            !estadoFiltro ||
            estado.includes(estadoFiltro);

        fila.style.display =
            coincidePlaca && coincideEstado
                ? ""
                : "none";

    });

}

async function confirmarDevolucionPrestamo(idPrestamo) {

    try {

        const respuesta =
            await fetchAutenticado(
                `${API_URL}/api/solicitudes-carpeta/prestamos/${idPrestamo}/devolver`,
                {
                    method: "POST",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify({
                        id_usuario_recibe: Number(sessionStorage.getItem("id_usuario"))
                    })
                }
            );

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudo confirmar devolución");
        }

        await cargarPrestamosDocumentales();

    } catch (error) {

        console.error(error);

    }

}

function formatearFechaTabla(fecha) {

    if (!fecha) {
        return "-";
    }

    return new Date(fecha).toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short"
    });

}

function obtenerEstadoRegistroUsuario(usuarioSistema) {

    const estadoRegistro =
        String(
            usuarioSistema.estado_registro ||
            (usuarioSistema.activo ? "ACTIVO" : "INACTIVO")
        ).toUpperCase();

    const mapaEstados = {
        ACTIVO: {
            texto: "Activo",
            clase: "estado-activo"
        },
        PENDIENTE: {
            texto: "Pendiente",
            clase: "estado-pendiente"
        },
        RECHAZADO: {
            texto: "Rechazado",
            clase: "estado-rechazado"
        },
        INACTIVO: {
            texto: "Inactivo",
            clase: "estado-inactivo"
        }
    };

    return mapaEstados[estadoRegistro] || mapaEstados.INACTIVO;

}

function mostrarEstadoUsuarios(texto, esError = false) {

    const estadoUsuarios =
        document.getElementById("estadoUsuarios");

    if (!estadoUsuarios) {
        return;
    }

    estadoUsuarios.hidden = false;
    estadoUsuarios.textContent = texto;
    estadoUsuarios.classList.toggle("estado-panel-error", esError);

}

async function cargarUsuariosSistema() {

    const tablaUsuariosBody =
        document.getElementById("tablaUsuariosBody");

    if (!tablaUsuariosBody) {
        return;
    }

    try {

        const respuesta =
            await fetchAutenticado(`${API_URL}/api/usuarios`);

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudieron cargar usuarios");
        }

        const usuarios =
            datos.usuarios || [];

        tablaUsuariosBody.innerHTML = "";

        if (usuarios.length === 0) {
            tablaUsuariosBody.innerHTML = `
                <tr>
                    <td colspan="8">No hay usuarios registrados</td>
                </tr>
            `;
            return;
        }

        usuarios.forEach((usuarioSistema) => {

            const fila =
                document.createElement("tr");

            [
                usuarioSistema.id_usuario,
                usuarioSistema.usuario,
                usuarioSistema.nombre_completo,
                usuarioSistema.correo,
                usuarioSistema.rol,
                usuarioSistema.oficina
            ].forEach((valor) => {

                const celda =
                    document.createElement("td");

                celda.textContent = valor || "-";
                fila.appendChild(celda);

            });

            const celdaEstado =
                document.createElement("td");

            const estado =
                document.createElement("span");

            const estadoRegistro =
                obtenerEstadoRegistroUsuario(usuarioSistema);

            estado.className =
                `estado-registro ${estadoRegistro.clase}`;
            estado.textContent =
                estadoRegistro.texto;

            celdaEstado.appendChild(estado);
            fila.appendChild(celdaEstado);

            const celdaAcceso =
                document.createElement("td");

            celdaAcceso.textContent =
                formatearFechaTabla(usuarioSistema.ultimo_acceso);

            fila.appendChild(celdaAcceso);
            tablaUsuariosBody.appendChild(fila);

        });

    } catch (error) {

        console.error(error);

        tablaUsuariosBody.innerHTML = `
            <tr>
                <td colspan="8">No fue posible cargar usuarios</td>
            </tr>
        `;

    }

}

async function cargarSolicitudesRegistroPendientes() {

    const tablaPendientesBody =
        document.getElementById("tablaUsuariosPendientesBody");

    if (!tablaPendientesBody) {
        return;
    }

    try {

        const respuesta =
            await fetchAutenticado(`${API_URL}/api/usuarios/pendientes`);

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudieron cargar las solicitudes pendientes");
        }

        const usuariosPendientes =
            datos.usuarios || [];

        tablaPendientesBody.innerHTML = "";

        if (usuariosPendientes.length === 0) {
            tablaPendientesBody.innerHTML = `
                <tr>
                    <td colspan="8">No hay solicitudes pendientes</td>
                </tr>
            `;
            return;
        }

        const rolesDisponibles =
            datos.roles || [];

        usuariosPendientes.forEach((usuarioPendiente) => {

            const fila =
                document.createElement("tr");

            [
                usuarioPendiente.id_usuario,
                usuarioPendiente.usuario,
                usuarioPendiente.nombre_completo,
                usuarioPendiente.correo
            ].forEach((valor) => {

                const celda =
                    document.createElement("td");

                celda.textContent = valor || "-";
                fila.appendChild(celda);

            });

            const celdaRol =
                document.createElement("td");

            const selectRol =
                document.createElement("select");

            selectRol.className = "select-rol-pendiente";
            selectRol.innerHTML =
                '<option value="">Seleccione rol</option>';

            rolesDisponibles.forEach((rolDisponible) => {

                const opcion =
                    document.createElement("option");

                opcion.value = rolDisponible.id_rol;
                opcion.textContent = rolDisponible.nombre;
                selectRol.appendChild(opcion);

            });

            celdaRol.appendChild(selectRol);
            fila.appendChild(celdaRol);

            [
                usuarioPendiente.oficina,
                formatearFechaTabla(usuarioPendiente.fecha_creacion)
            ].forEach((valor) => {

                const celda =
                    document.createElement("td");

                celda.textContent = valor || "-";
                fila.appendChild(celda);

            });

            const celdaAcciones =
                document.createElement("td");

            const acciones =
                document.createElement("div");

            acciones.className = "acciones-usuarios-pendientes";

            const aprobar =
                document.createElement("button");

            aprobar.type = "button";
            aprobar.className = "btn-usuario-aprobar";
            aprobar.textContent = "Aprobar";
            aprobar.addEventListener("click", () =>
                gestionarRegistroUsuario(
                    usuarioPendiente.id_usuario,
                    "aprobar",
                    selectRol.value
                )
            );

            const rechazar =
                document.createElement("button");

            rechazar.type = "button";
            rechazar.className = "btn-usuario-rechazar";
            rechazar.textContent = "Rechazar";
            rechazar.addEventListener("click", () =>
                gestionarRegistroUsuario(usuarioPendiente.id_usuario, "rechazar")
            );

            acciones.appendChild(aprobar);
            acciones.appendChild(rechazar);
            celdaAcciones.appendChild(acciones);
            fila.appendChild(celdaAcciones);
            tablaPendientesBody.appendChild(fila);

        });

    } catch (error) {

        console.error(error);

        tablaPendientesBody.innerHTML = `
            <tr>
                <td colspan="8">No fue posible cargar las solicitudes pendientes</td>
            </tr>
        `;

    }

}

async function gestionarRegistroUsuario(idUsuario, accion, idRol = "") {

    if (accion === "aprobar" && !idRol) {
        mostrarEstadoUsuarios(
            "Seleccione un rol antes de aprobar al usuario",
            true
        );
        return;
    }

    try {

        mostrarEstadoUsuarios("Actualizando solicitud...", false);

        const respuesta =
            await fetchAutenticado(
                `${API_URL}/api/usuarios/${idUsuario}/${accion}`,
                {
                    method: "PUT",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify(
                        accion === "aprobar"
                            ? { id_rol: Number(idRol) }
                            : {}
                    )
                }
            );

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudo actualizar el usuario");
        }

        mostrarEstadoUsuarios(
            accion === "aprobar"
                ? "Usuario aprobado correctamente"
                : "Usuario rechazado correctamente",
            false
        );

        await cargarSolicitudesRegistroPendientes();
        await cargarUsuariosSistema();

    } catch (error) {

        console.error(error);
        mostrarEstadoUsuarios(
            error.message || "No fue posible actualizar el usuario",
            true
        );

    }

}

async function cargarAuditoriaSistema() {

    const tablaAuditoriaBody =
        document.getElementById("tablaAuditoriaBody");

    if (!tablaAuditoriaBody) {
        return;
    }

    try {

        const respuesta =
            await fetchAutenticado(`${API_URL}/api/auditoria`);

        const datos =
            await respuesta.json();

        if (!datos.success) {
            throw new Error(datos.message || "No se pudo cargar auditoria");
        }

        const eventos =
            datos.eventos || [];

        tablaAuditoriaBody.innerHTML = "";

        if (eventos.length === 0) {
            tablaAuditoriaBody.innerHTML = `
                <tr>
                    <td colspan="6">Aún no hay eventos de auditoria</td>
                </tr>
            `;
            return;
        }

        eventos.forEach((evento) => {

            const fila =
                document.createElement("tr");

            [
                formatearFechaTabla(evento.fecha_evento),
                evento.nombre_usuario,
                evento.modulo,
                evento.accion,
                evento.descripcion,
                evento.referencia_tipo
                    ? `${evento.referencia_tipo} #${evento.referencia_id || "-"}`
                    : "-"
            ].forEach((valor) => {

                const celda =
                    document.createElement("td");

                celda.textContent = valor || "-";
                fila.appendChild(celda);

            });

            tablaAuditoriaBody.appendChild(fila);

        });

    } catch (error) {

        console.error(error);

        tablaAuditoriaBody.innerHTML = `
            <tr>
                <td colspan="6">No fue posible cargar auditoria</td>
            </tr>
        `;

    }

}

function inicializarChatInstitucional() {


    const listaMensajes =
        document.getElementById("listaMensajesChat");

    const estadoChat =
        document.getElementById("estadoChat");

    const formularioChat =
        document.getElementById("formularioChat");

    const mensajeChat =
        document.getElementById("mensajeChat");

    const btnActualizarChat =
        document.getElementById("btnActualizarChat");

    const btnSolicitarCarpeta =
        document.getElementById("btnSolicitarCarpeta");

    const modalSolicitudCarpeta =
        document.getElementById("modalSolicitudCarpeta");

    const formSolicitudCarpeta =
        document.getElementById("formSolicitudCarpeta");

    const placaSolicitud =
        document.getElementById("placaSolicitud");

    const mensajeValidacionPlaca =
        document.getElementById("mensajeValidacionPlaca");

    const motivoSolicitud =
        document.getElementById("motivoSolicitud");

    const observacionSolicitud =
        document.getElementById("observacionSolicitud");

    const btnCerrarModalSolicitud =
        document.getElementById("btnCerrarModalSolicitud");

    const btnCancelarSolicitud =
        document.getElementById("btnCancelarSolicitud");


    const busquedaChat =
        document.getElementById("busquedaChat");

    const resultadoBusquedaChat =
        document.getElementById("resultadoBusquedaChat");

    const menuMensajeChat =
        document.getElementById("menuMensajeChat");

    const btnEliminarMensajeChat =
        document.getElementById("btnEliminarMensajeChat");

    if (!listaMensajes || !formularioChat || !mensajeChat) {
        return;
    }

    const botonEnviarChat =
        formularioChat.querySelector('button[type="submit"]');

    let envioMensajeEnCurso = false;

    mensajeChat.addEventListener("keydown", (evento) => {

        if (evento.key !== "Enter" || evento.shiftKey) {
            return;
        }

        if (envioMensajeEnCurso) {
            evento.preventDefault();
            return;
        }

        evento.preventDefault();
        formularioChat.requestSubmit();

    });

    const idUsuario = sessionStorage.getItem("id_usuario");
    const idOficina = sessionStorage.getItem("id_oficina");
    const rolUsuarioActual = sessionStorage.getItem("rol");
    const puedeGestionarSolicitudes =
        rolUsuarioActual === "2" || rolUsuarioActual === "3";
    let mensajesChat = [];
    let mensajeSeleccionado = null;

    if (window.chatInstitucionalEventSource) {
        window.chatInstitucionalEventSource.close();
    }

    function mostrarEstado(texto, esError = false) {

        if (!estadoChat) {
            return;
        }

        estadoChat.textContent = texto;
        estadoChat.classList.toggle("estado-chat-error", esError);

    }

    function esFormatoPlacaValido(placa) {

        return /^[A-Z0-9]+-[A-Z0-9]+$/.test(
            String(placa || "").trim()
        );

    }

    function actualizarValidacionPlaca(forzarMensaje = false) {

        if (!placaSolicitud || !mensajeValidacionPlaca) {
            return true;
        }

        placaSolicitud.value =
            String(placaSolicitud.value || "").toUpperCase();

        const placa =
            placaSolicitud.value.trim();

        const esValida =
            esFormatoPlacaValido(placa);

        const mostrarError =
            (forzarMensaje && !placa) ||
            (placa.length > 0 && !esValida);

        placaSolicitud.classList.toggle(
            "input-placa-invalida",
            mostrarError
        );

        mensajeValidacionPlaca.hidden =
            !mostrarError;

        return esValida;

    }

    function mostrarToast(tipo, mensaje) {

        let contenedorToast =
            document.getElementById("contenedorToastSistema");

        if (!contenedorToast) {

            contenedorToast =
                document.createElement("div");

            contenedorToast.id = "contenedorToastSistema";
            contenedorToast.className = "contenedor-toast-sistema";
            document.body.appendChild(contenedorToast);

        }

        const toast =
            document.createElement("div");

        toast.className = `toast-sistema toast-${tipo}`;
        toast.textContent = mensaje;
        contenedorToast.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add("toast-visible");
        });

        const ocultarToast = () => {

            toast.classList.remove("toast-visible");
            toast.classList.add("toast-oculto");

            window.setTimeout(() => {
                toast.remove();
            }, 300);

        };

        window.setTimeout(ocultarToast, 4000);

    }

    function ocultarMenuMensaje() {

        if (!menuMensajeChat) {
            return;
        }

        menuMensajeChat.hidden = true;
        mensajeSeleccionado = null;

    }

    function normalizarTexto(texto) {

        return String(texto || "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");

    }

    function actualizarContadorBusqueda(cantidad, total, buscando) {

        if (!resultadoBusquedaChat) {
            return;
        }

        if (!buscando) {
            resultadoBusquedaChat.textContent =
                `${total} ${total === 1 ? "mensaje" : "mensajes"}`;
            return;
        }

        resultadoBusquedaChat.textContent =
            `${cantidad} de ${total}`;

    }

    function formatearHora(fecha) {

        return new Date(fecha).toLocaleString("es-CO", {
            hour: "2-digit",
            minute: "2-digit"
        });

    }

    function obtenerInicial(nombre) {

        return String(nombre || "Usuario")
            .trim()
            .charAt(0)
            .toUpperCase() || "U";

    }

    function crearSolicitudHTML(mensaje) {

        const solicitud =
            mensaje.solicitud || {};

        const articulo =
            document.createElement("article");

        articulo.className = "tarjeta-solicitud-chat";
        articulo.dataset.idSolicitud = solicitud.id_solicitud || "";

        const titulo =
            document.createElement("div");

        titulo.className = "tarjeta-solicitud-titulo";
        titulo.textContent = "Solicitud de carpeta";

        const estado =
            document.createElement("span");

        estado.className = `estado-solicitud estado-${String(solicitud.estado || "PENDIENTE").toLowerCase()}`;
        estado.textContent = solicitud.estado || "PENDIENTE";

        const datos =
            document.createElement("div");

        datos.className = "datos-solicitud";
        const fechaSolicitud =
            solicitud.fecha_solicitud
                ? new Date(solicitud.fecha_solicitud)
                    .toLocaleString("es-CO", {
                        timeZone: "America/Bogota"
                    })
                : "Sin fecha";
        [

            ["Placa", solicitud.placa],
            ["Motivo", solicitud.motivo],
            ["Solicita", solicitud.usuario_solicita],
            ["Oficina", solicitud.oficina],
            ["Observación", solicitud.observacion || "Sin observación"],
            ["Fecha de solicitud", fechaSolicitud]

        ].forEach(([label, valor]) => {

            const item =
                document.createElement("p");

            item.innerHTML = `<strong>${label}:</strong> `;
            item.appendChild(document.createTextNode(valor || "Sin dato"));
            datos.appendChild(item);

        });

        articulo.appendChild(titulo);
        articulo.appendChild(estado);
        articulo.appendChild(datos);

        if (
            puedeGestionarSolicitudes &&
            String(solicitud.estado || "") === "PENDIENTE"
        ) {

            const acciones =
                document.createElement("div");

            acciones.className = "acciones-solicitud";

            const aprobar =
                document.createElement("button");

            aprobar.type = "button";
            aprobar.className = "btn-aprobar-solicitud";
            aprobar.textContent = "Aceptar";
            aprobar.addEventListener("click", () =>
                gestionarSolicitud(solicitud.id_solicitud, "aprobar")
            );

            const selectRechazo =
                document.createElement("select");

            selectRechazo.className = "select-rechazo-solicitud";

            [
                "No se encuentra en archivo",
                "Trasladada a otra ciudad",
                "En auditoría",
                "Préstamo activo"
            ].forEach((motivo) => {

                const opcion =
                    document.createElement("option");

                opcion.value = motivo;
                opcion.textContent = motivo;
                selectRechazo.appendChild(opcion);

            });

            const rechazar =
                document.createElement("button");

            rechazar.type = "button";
            rechazar.className = "btn-rechazar-solicitud";
            rechazar.textContent = "Rechazar";
            rechazar.addEventListener("click", () =>
                gestionarSolicitud(
                    solicitud.id_solicitud,
                    "rechazar",
                    selectRechazo.value
                )
            );

            acciones.appendChild(aprobar);
            acciones.appendChild(rechazar);
            acciones.appendChild(selectRechazo);
            articulo.appendChild(acciones);

        }

        return articulo;

    }

    function crearMensajeHTML(mensaje) {

        if (
            mensaje.tipo === "SOLICITUD_CARPETA" &&
            mensaje.solicitud &&
            mensaje.solicitud.id_solicitud
        ) {
            return crearSolicitudHTML(mensaje);
        }

        const idMensajeUsuario =
            mensaje.id_usuario ?? mensaje.idUsuario;

        const nombreMensajeUsuario =
            mensaje.nombre_usuario || mensaje.usuario || "Usuario";

        const textoMensaje =
            mensaje.mensaje || mensaje.contenido || "";

        const fechaMensaje =
            mensaje.creado_en || mensaje.fecha_envio || new Date();

        const esPropio =
            String(idMensajeUsuario || "") === String(idUsuario || "");

        const articulo =
            document.createElement("article");

        articulo.className =
            `mensaje-chat ${esPropio ? "mensaje-chat-propio" : ""}`;
        articulo.dataset.idMensaje =
            mensaje.id_mensaje || mensaje.idMensaje || "";

        if (esPropio) {

            articulo.addEventListener("contextmenu", (evento) => {

                evento.preventDefault();
                mensajeSeleccionado = mensaje;

                if (!menuMensajeChat) {
                    return;
                }

                menuMensajeChat.style.left = `${evento.clientX}px`;
                menuMensajeChat.style.top = `${evento.clientY}px`;
                menuMensajeChat.hidden = false;

            });

        }

        const avatar =
            document.createElement("div");

        avatar.className = "mensaje-chat-avatar";
        avatar.textContent = obtenerInicial(nombreMensajeUsuario);

        const burbuja =
            document.createElement("div");

        burbuja.className = "mensaje-chat-burbuja";

        const autor =
            document.createElement("strong");

        autor.className = "mensaje-chat-autor";
        autor.textContent = nombreMensajeUsuario;

        const cuerpo =
            document.createElement("div");

        cuerpo.className = "mensaje-chat-cuerpo";

        const texto =
            document.createElement("p");

        texto.textContent = textoMensaje;

        const fecha =
            document.createElement("span");

        fecha.className = "mensaje-chat-hora";
        fecha.textContent = formatearHora(fechaMensaje);

        cuerpo.appendChild(texto);
        cuerpo.appendChild(fecha);
        burbuja.appendChild(autor);
        burbuja.appendChild(cuerpo);

        if (esPropio) {
            articulo.appendChild(burbuja);
            articulo.appendChild(avatar);
        } else {
            articulo.appendChild(avatar);
            articulo.appendChild(burbuja);
        }


        return articulo;

    }

    function renderizarMensajes() {

        listaMensajes.innerHTML = "";
        ocultarMenuMensaje();

        const busqueda =
            normalizarTexto(busquedaChat ? busquedaChat.value : "");

        const mensajesFiltrados = busqueda
            ? mensajesChat.filter((mensaje) => {

                const textoMensaje =
                    mensaje.mensaje || mensaje.contenido || "";

                const autorMensaje =
                    mensaje.nombre_usuario || mensaje.usuario || "";

                const solicitudTexto = mensaje.solicitud
                    ? [
                        mensaje.solicitud.placa,
                        mensaje.solicitud.motivo,
                        mensaje.solicitud.estado,
                        mensaje.solicitud.oficina,
                        mensaje.solicitud.usuario_solicita
                    ].join(" ")
                    : "";

                return normalizarTexto(`${textoMensaje} ${autorMensaje} ${solicitudTexto}`)
                    .includes(busqueda);

            })
            : mensajesChat;

        if (mensajesFiltrados.length === 0) {

            const vacio =
                document.createElement("div");

            vacio.className = "chat-sin-mensajes";
            vacio.textContent = busqueda
                ? "No se encontraron mensajes con esa busqueda."
                : "Aun no hay mensajes institucionales.";
            listaMensajes.appendChild(vacio);

        } else {

            mensajesFiltrados.forEach((mensaje) => {
                listaMensajes.appendChild(crearMensajeHTML(mensaje));
            });

            listaMensajes.scrollTop = listaMensajes.scrollHeight;

        }

        actualizarContadorBusqueda(
            mensajesFiltrados.length,
            mensajesChat.length,
            Boolean(busqueda)
        );

    }

    function agregarMensajeChat(mensajeNuevo) {

        const idMensajeNuevo =
            String(mensajeNuevo.id_mensaje || mensajeNuevo.idMensaje || "");

        if (!idMensajeNuevo) {
            return;
        }

        const existeMensaje =
            mensajesChat.some((mensaje) =>
                String(mensaje.id_mensaje || mensaje.idMensaje || "") === idMensajeNuevo
            );

        if (!existeMensaje) {
            mensajesChat.push(mensajeNuevo);
            renderizarMensajes();
        }

    }

    function quitarMensajeChat(idMensaje) {

        mensajesChat = mensajesChat.filter((mensaje) =>
            String(mensaje.id_mensaje || mensaje.idMensaje || "") !== String(idMensaje)
        );

        renderizarMensajes();

    }

    function actualizarSolicitudChat(mensajeActualizado) {

        const idSolicitudActualizada =
            mensajeActualizado?.solicitud?.id_solicitud;

        if (!idSolicitudActualizada) {
            return;
        }

        mensajesChat = mensajesChat.map((mensaje) => {

            const idSolicitudMensaje =
                mensaje?.solicitud?.id_solicitud;

            if (String(idSolicitudMensaje) === String(idSolicitudActualizada)) {
                return mensajeActualizado;
            }

            return mensaje;

        });

        renderizarMensajes();

    }

    async function gestionarSolicitud(idSolicitud, accion, motivoRechazo = "") {

        if (!idSolicitud) {
            mostrarEstado("No se pudo identificar la solicitud", true);
            return;
        }

        try {

            mostrarEstado("Actualizando solicitud...");

            const url =
                `${API_URL}/api/solicitudes-carpeta/${idSolicitud}/${accion}`;

            const respuesta =
                await fetchAutenticado(url, {
                    method: "PUT",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify({
                        id_usuario_responde: Number(idUsuario),
                        motivo_rechazo: motivoRechazo
                    })
                });

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(datos.message || "No se pudo actualizar solicitud");
            }

            if (datos.mensaje) {
                actualizarSolicitudChat(datos.mensaje);
            }

            await cargarPrestamosDocumentales();
            mostrarEstado("Solicitud actualizada");

        } catch (error) {

            console.error(error);
            mostrarEstado(error.message || "Error al actualizar solicitud", true);

        }

    }

    function conectarEventosChat() {

        if (!window.EventSource) {
            setInterval(cargarMensajes, 3000);
            return;
        }

        const eventosChat =
            new EventSource(`${API_URL}/api/chat/eventos?${obtenerQuerySesion()}`);

        window.chatInstitucionalEventSource = eventosChat;

        eventosChat.addEventListener("mensaje-creado", (evento) => {

            const mensajeNuevo =
                JSON.parse(evento.data);

            agregarMensajeChat(mensajeNuevo);
            mostrarEstado("Nuevo mensaje recibido");

        });

        eventosChat.addEventListener("mensaje-eliminado", (evento) => {

            const datos =
                JSON.parse(evento.data);

            quitarMensajeChat(datos.id_mensaje);
            mostrarEstado("Mensaje eliminado");

        });

        eventosChat.addEventListener("solicitud-actualizada", (evento) => {

            const mensajeActualizado =
                JSON.parse(evento.data);

            actualizarSolicitudChat(mensajeActualizado);
            cargarPrestamosDocumentales();
            mostrarEstado("Solicitud actualizada");

        });

        eventosChat.onerror = () => {
            mostrarEstado("Reconectando chat en vivo...");
        };

    }

    async function cargarMensajes() {

        try {

            mostrarEstado("Cargando mensajes...");

            const respuesta =
                await fetchAutenticado(`${API_URL}/api/chat/mensajes`);

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(
                    datos.message || "No se pudieron cargar los mensajes"
                );
            }

            mensajesChat = datos.mensajes || [];
            renderizarMensajes();

            mostrarEstado("Mensajes actualizados");

        } catch (error) {

            console.error(error);
            mostrarEstado("No fue posible cargar el chat", true);

        }

    }

    async function eliminarMensajeSeleccionado() {

        if (!mensajeSeleccionado) {
            return;
        }

        const idMensaje =
            mensajeSeleccionado.id_mensaje || mensajeSeleccionado.idMensaje;

        if (!idMensaje) {
            mostrarEstado("No se pudo identificar el mensaje", true);
            ocultarMenuMensaje();
            return;
        }

        try {

            mostrarEstado("Eliminando mensaje...");

            const respuesta = await fetchAutenticado(
                `${API_URL}/api/chat/mensajes/${idMensaje}`,
                {
                    method: "DELETE",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify({
                        id_usuario: idUsuario
                    })
                }
            );

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(
                    datos.message || "No se pudo eliminar el mensaje"
                );
            }

            mensajesChat = mensajesChat.filter((mensaje) =>
                String(mensaje.id_mensaje || mensaje.idMensaje) !== String(idMensaje)
            );

            renderizarMensajes();
            mostrarEstado("Mensaje eliminado");

        } catch (error) {

            console.error(error);
            mostrarEstado("No fue posible eliminar el mensaje", true);

        }

    }

    formularioChat.addEventListener("submit", async (evento) => {

        evento.preventDefault();

        if (envioMensajeEnCurso) {
            return;
        }

        const textoMensaje =
            mensajeChat.value.trim();

        if (!textoMensaje) {
            return;
        }

        try {

            mostrarEstado("Enviando mensaje...");
            envioMensajeEnCurso = true;

            if (botonEnviarChat) {
                botonEnviarChat.disabled = true;
            }

            const respuesta = await fetchAutenticado(
                `${API_URL}/api/chat/mensajes`,
                {
                    method: "POST",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify({
                        id_usuario: idUsuario,
                        mensaje: textoMensaje
                    })
                }
            );

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(
                    datos.message || "No se pudo enviar el mensaje"
                );
            }

            mensajeChat.value = "";
            agregarMensajeChat(datos.mensaje);

        } catch (error) {

            console.error(error);
            mostrarEstado("No fue posible enviar el mensaje", true);

        } finally {

            envioMensajeEnCurso = false;

            if (botonEnviarChat) {
                botonEnviarChat.disabled = false;
            }

        }

    });

    if (btnActualizarChat) {
        btnActualizarChat.addEventListener("click", cargarMensajes);
    }

    if (busquedaChat) {
        busquedaChat.addEventListener("input", renderizarMensajes);
    }

    if (btnEliminarMensajeChat) {
        btnEliminarMensajeChat.addEventListener(
            "click",
            eliminarMensajeSeleccionado
        );
    }

    function abrirModalSolicitud() {

        if (!modalSolicitudCarpeta || !btnSolicitarCarpeta) {
            return;
        }

        if (btnSolicitarCarpeta.disabled) {
            return;
        }

        btnSolicitarCarpeta.disabled = true;
        modalSolicitudCarpeta.hidden = false;

        placaSolicitud?.focus();
    }

    function cerrarModalSolicitud() {

        if (!modalSolicitudCarpeta) {
            return;
        }

        modalSolicitudCarpeta.hidden = true;

        if (btnSolicitarCarpeta) {
            btnSolicitarCarpeta.disabled = false;
        }

        formSolicitudCarpeta?.reset();
        actualizarValidacionPlaca(false);

    }
    async function cargarMotivosSolicitud() {

        if (!motivoSolicitud) {
            return;
        }

        try {

            const respuesta =
                await fetchAutenticado(`${API_URL}/api/solicitudes-carpeta/motivos`);

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(datos.message || "No se pudieron cargar motivos");
            }

            motivoSolicitud.innerHTML =
                '<option value="">Seleccione un motivo</option>';

            (datos.motivos || []).forEach((motivo) => {

                const opcion =
                    document.createElement("option");

                opcion.value = motivo.id_motivo;
                opcion.textContent = motivo.nombre;
                motivoSolicitud.appendChild(opcion);

            });

        } catch (error) {

            console.error(error);
            mostrarEstado("No fue posible cargar motivos", true);

        }

    }

    async function enviarSolicitudCarpeta(evento) {

        evento.preventDefault();

        const placa =
            placaSolicitud.value.trim().toUpperCase();

        const idMotivo =
            Number(motivoSolicitud.value);

        placaSolicitud.value = placa;

        if (!placa || !idMotivo) {
            actualizarValidacionPlaca(true);
            mostrarEstado("Complete placa y motivo", true);
            return;
        }

        if (!actualizarValidacionPlaca(true)) {
            return;
        }

        try {

            mostrarEstado("Registrando solicitud...");

            const respuesta =
                await fetchAutenticado(`${API_URL}/api/solicitudes-carpeta`, {
                    method: "POST",
                    headers: obtenerHeadersSesion(true),
                    body: JSON.stringify({
                        id_usuario_solicita: Number(idUsuario),
                        id_oficina_solicitante: Number(idOficina),
                        id_motivo: idMotivo,
                        placa,
                        observacion: observacionSolicitud.value.trim()
                    })
                });

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(datos.message || "No se pudo registrar solicitud");
            }

            if (datos.mensaje) {
                agregarMensajeChat(datos.mensaje);
            }

            cerrarModalSolicitud();
            mostrarToast("success", "\u2714 Solicitud realizada");

        } catch (error) {

            console.error(error);
            const mensajeError =
                error.message === "La carpeta ya tiene un préstamo activo"
                    ? "\u2716 Solicitud denegada. La carpeta ya tiene un préstamo activo."
                    : (error.message || "Error al registrar solicitud");
            mostrarToast("error", mensajeError);

        }

    }

    if (btnSolicitarCarpeta) {
        btnSolicitarCarpeta.addEventListener("click", abrirModalSolicitud);
    }

    if (btnCerrarModalSolicitud) {
        btnCerrarModalSolicitud.addEventListener("click", cerrarModalSolicitud);
    }

    if (btnCancelarSolicitud) {
        btnCancelarSolicitud.addEventListener("click", cerrarModalSolicitud);
    }

    if (formSolicitudCarpeta) {
        formSolicitudCarpeta.addEventListener("submit", enviarSolicitudCarpeta);
    }

    if (placaSolicitud) {
        placaSolicitud.addEventListener("input", () => {
            actualizarValidacionPlaca(false);
        });
    }

    document.addEventListener("click", ocultarMenuMensaje);
    document.addEventListener("scroll", ocultarMenuMensaje, true);

    cargarMotivosSolicitud();
    cargarMensajes();
    conectarEventosChat();

}

async function cerrarSesion() {

    try {

        const idUsuario =
            sessionStorage.getItem("id_usuario");

        const tokenSesion =
            obtenerTokenSesion();

        if (idUsuario && tokenSesion) {
            await fetch(`${API_URL}/api/auth/logout`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id_usuario: Number(idUsuario),
                    token_sesion: tokenSesion
                })
            });
        }

    } catch (error) {

        console.error(error);

    } finally {

        if (window.heartbeatSesionTimer) {
            window.clearInterval(window.heartbeatSesionTimer);
        }

        limpiarSesionLocal();
        window.location.href = "login.html";

    }

}
document.addEventListener("DOMContentLoaded", () => {

    const btnMenuMovil =
        document.getElementById("btnMenuMovil");

    const menu =
        document.querySelector(".menu-lateral");

    if (btnMenuMovil) {

        btnMenuMovil.addEventListener(
            "click",
            () => {

                menu.classList.toggle("activo");

            }
        );

    }

});
function probarAccesoAdmin() {

    fetchAutenticado(`${API_URL}/api/secure/admin`, {
        method: 'GET',
        headers: {
            'x-user': sessionStorage.getItem('usuario'),
            'x-role': sessionStorage.getItem('rol')
        }
    })
        .then(r => r.json())
        .then(data => console.log(data))
        .catch(err => console.error(err));

}

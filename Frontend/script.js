console.log("script cargado");
const API_URL = "https://gestion-documental-api-erbn.onrender.com";

document.addEventListener("DOMContentLoaded", () => {

    const formulario = document.getElementById("container-login");

    if (!formulario) {
        console.log("Esta página no tiene login");
        return;
    }

    console.log("Formulario encontrado");

    const mensajeLogin =
        document.getElementById("mensajeLogin");

    function mostrarMensajeLogin(texto) {

        if (!mensajeLogin) {
            return;
        }

        mensajeLogin.textContent = texto;
        mensajeLogin.hidden = false;

    }

    function ocultarMensajeLogin() {

        if (!mensajeLogin) {
            return;
        }

        mensajeLogin.textContent = "";
        mensajeLogin.hidden = true;

    }

    formulario.addEventListener("submit", async (e) => {

        e.preventDefault();
        ocultarMensajeLogin();

        const usuario = document.getElementById("Usuario").value.trim();
        const password = document.getElementById("Contraseña").value.trim();
        const controlador =
            new AbortController();
        const timeoutLogin =
            setTimeout(() => controlador.abort(), 10000);

        try {

            const respuesta = await fetch(
                `${API_URL}/api/auth/login`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        usuario,
                        password
                    }),
                    signal: controlador.signal
                }
            );

            clearTimeout(timeoutLogin);
            let datos = {};

            try {
                datos = await respuesta.json();
            } catch (errorJson) {
                datos = {};
            }

            console.log(datos);

            if (datos.success) {

                console.log("Bienvenido " + datos.usuario);

                sessionStorage.setItem(
                    "usuario",
                    datos.usuario
                );

                sessionStorage.setItem(
                    "rol",
                    datos.rol
                );

                sessionStorage.setItem(
                    "id_usuario",
                    datos.id_usuario
                );

                sessionStorage.setItem(
                    "id_oficina",
                    datos.id_oficina
                );

                sessionStorage.setItem(
                    "token_sesion",
                    datos.token_sesion
                );

                sessionStorage.setItem(
                    "ultimo_acceso",
                    datos.ultimo_acceso || ""
                );

                window.location.href = "index.html";

            } else {

                console.log(datos.message);
                if (respuesta.status === 401) {
                    mostrarMensajeLogin("Usuario o contraseña incorrectos.");
                } else if (respuesta.status >= 500) {
                    mostrarMensajeLogin("Error interno del servidor.");
                } else {
                    mostrarMensajeLogin(datos.message || "No fue posible iniciar sesión.");
                }

            }

        } catch (error) {

            clearTimeout(timeoutLogin);
            console.error(error);

            if (error.name === "AbortError") {
                mostrarMensajeLogin("Tiempo de espera agotado.");
            } else {
                mostrarMensajeLogin("No hay conexión con el servidor.");
            }

        }

    });

});

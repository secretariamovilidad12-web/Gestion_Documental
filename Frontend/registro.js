const API_URL = "https://gestion-documental-api-erbn.onrender.com";

document.addEventListener("DOMContentLoaded", () => {

    const formulario =
        document.getElementById("formRegistro");

    if (!formulario) {
        return;
    }

    const mensajeRegistro =
        document.getElementById("mensajeRegistro");

    const oficinaRegistro =
        document.getElementById("OficinaRegistro");

    function mostrarMensaje(texto) {

        if (!mensajeRegistro) {
            return;
        }

        mensajeRegistro.textContent = texto;
        mensajeRegistro.hidden = false;

    }

    function ocultarMensaje() {

        if (!mensajeRegistro) {
            return;
        }

        mensajeRegistro.textContent = "";
        mensajeRegistro.hidden = true;

    }

    async function cargarCatalogos() {

        try {

            const respuesta =
                await fetch(`${API_URL}/api/auth/catalogos-registro`);

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(datos.message || "No se pudieron cargar los datos del registro");
            }

            const oficinas =
                datos.oficinas || [];

            oficinaRegistro.innerHTML = "";

            if (oficinas.length !== 1) {
                const opcionVacia =
                    document.createElement("option");

                opcionVacia.value = "";
                opcionVacia.textContent = "Seleccione una oficina";
                oficinaRegistro.appendChild(opcionVacia);
            }

            oficinas.forEach((oficina) => {
                const opcion =
                    document.createElement("option");

                opcion.value = oficina.id_oficina;
                opcion.textContent = oficina.nombre;
                oficinaRegistro.appendChild(opcion);
            });

            if (oficinas.length === 1) {
                oficinaRegistro.value = String(oficinas[0].id_oficina);
                oficinaRegistro.disabled = true;
            } else {
                oficinaRegistro.disabled = false;
            }

        } catch (error) {

            console.error(error);
            mostrarMensaje("No fue posible cargar el formulario de registro.");

        }

    }

    formulario.addEventListener("submit", async (evento) => {

        evento.preventDefault();
        ocultarMensaje();

        const nombreCompleto =
            document.getElementById("NombreCompleto").value.trim();

        const usuario =
            document.getElementById("UsuarioRegistro").value.trim();

        const correo =
            document.getElementById("CorreoRegistro").value.trim();

        const password =
            document.getElementById("PasswordRegistro").value;

        try {

            const respuesta =
                await fetch(`${API_URL}/api/auth/registro`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        nombre_completo: nombreCompleto,
                        usuario,
                        correo,
                        password,
                        id_oficina: Number(oficinaRegistro.value)
                    })
                });

            const datos =
                await respuesta.json();

            if (!datos.success) {
                throw new Error(datos.message || "No se pudo enviar la solicitud de registro");
            }

            mostrarMensaje(datos.message || "Solicitud enviada correctamente.");
            formulario.reset();

            window.setTimeout(() => {
                window.location.href = "login.html";
            }, 1800);

        } catch (error) {

            console.error(error);
            mostrarMensaje(error.message || "No se pudo enviar la solicitud de registro");

        }

    });

    cargarCatalogos();

});

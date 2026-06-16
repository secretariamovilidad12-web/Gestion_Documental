const bcrypt = require('bcrypt');

(async () => {

    const users = [
        { usuario: 'yeison.admin', pass: 'Y3ison_@2026' },
        { usuario: 'yeison.gestor', pass: 'Y3isonG_@2026' },
        { usuario: 'eugenia', pass: 'Eug3nia_@2026' },
        { usuario: 'lorena', pass: 'L0rena_@2026' }
    ];

    for (const u of users) {

        const hash = await bcrypt.hash(u.pass, 12);

        console.log(`UPDATE usuarios SET password_hash='${hash}' WHERE usuario='${u.usuario}';`);

    }

})();
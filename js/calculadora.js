// ==========================================================
// CALCULADORA flotante: teclado, copiar monto, ventana movible
// (escritorio y tablet) o fija abajo (teléfono).
// Sin eval: las cuentas las resuelve un analizador propio.
// ==========================================================
(function () {
    const LS = 'buddy_calc_pos';
    let panel, input, hist, btnCopiar, ultimo = null, recienEvaluado = false;
    const esTelefono = () => window.matchMedia('(max-width: 767px)').matches;
    const punteroFino = () => window.matchMedia('(pointer: fine)').matches;

    // ---------- Analizador de expresiones ----------
    // Admite + - * / ( ) % y decimales. "100 + 10%" suma el 10 % de 100 (como una calculadora de comercio).
    function evaluar(txt) {
        const s = txt.replace(/\s+/g, ''); let i = 0;
        const fallo = () => { throw new Error('expresion'); };
        function numero() {
            const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) fallo();
            i += m[0].length; return parseFloat(m[0]);
        }
        function primario() {
            if (s[i] === '(') { i++; const v = suma().v; if (s[i] !== ')') fallo(); i++; return v; }
            return numero();
        }
        function factor() {
            if (s[i] === '-') { i++; const f = factor(); return { v: -f.v, pct: f.pct }; }
            if (s[i] === '+') { i++; return factor(); }
            let v = primario(), pct = false;
            while (s[i] === '%') { i++; v = v / 100; pct = true; }
            return { v, pct };
        }
        function termino() {
            let f = factor(), v = f.v, solo = f.pct;
            while (s[i] === '*' || s[i] === '/') {
                const op = s[i++], d = factor().v; solo = false;
                if (op === '/') { if (d === 0) throw new Error('division'); v = v / d; } else v = v * d;
            }
            return { v, pct: solo };
        }
        function suma() {
            let t = termino(), v = t.v;
            while (s[i] === '+' || s[i] === '-') {
                const op = s[i++], r = termino();
                const x = r.pct ? v * r.v : r.v;           // 100 + 10% = 110
                v = op === '+' ? v + x : v - x;
            }
            return { v };
        }
        if (!s) throw new Error('vacio');
        const r = suma().v; if (i !== s.length || !isFinite(r)) fallo();
        return Math.round(r * 1e6) / 1e6;
    }

    // ---------- Construcción ----------
    function construir() {
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'panel-calculadora';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Calculadora');
        panel.className = 'hidden bg-white rounded-2xl shadow-2xl border border-slate-200 select-none';
        panel.style.cssText = 'position:fixed;z-index:300;width:288px;max-width:100vw;';
        const b = (t, cls, fn, extra) => `<button type="button" data-k="${fn}" class="py-3 md:py-2.5 rounded-lg font-bold text-sm transition-colors ${cls} ${extra || ''}">${t}</button>`;
        const num = 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm', op = 'bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100', gris = 'bg-slate-100 text-slate-600 hover:bg-slate-200';
        panel.innerHTML = `
            <div id="calc-barra" class="flex items-center justify-between px-4 py-2 bg-slate-800 text-white rounded-t-2xl md:cursor-move" style="touch-action:none">
                <span class="text-sm font-black">🧮 Calculadora</span>
                <button type="button" data-k="cerrar" class="text-slate-300 hover:text-white text-lg leading-none px-1" aria-label="Cerrar">✕</button>
            </div>
            <div class="p-3">
                <p id="calc-hist" class="h-4 text-right text-xs text-slate-400 font-mono truncate"></p>
                <input type="text" id="calc-display" value="0" autocomplete="off" spellcheck="false" maxlength="80"
                    class="w-full mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-3 text-right text-xl font-mono text-slate-800 outline-none focus:ring-2 focus:ring-emerald-400 shadow-inner tracking-wider select-text">
                <div class="grid grid-cols-4 gap-2">
                    ${b('C', 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100', 'C')}${b('⌫', gris, 'DEL')}${b('(', gris, '(')}${b(')', gris, ')')}
                    ${b('7', num, '7')}${b('8', num, '8')}${b('9', num, '9')}${b('÷', op, '/')}
                    ${b('4', num, '4')}${b('5', num, '5')}${b('6', num, '6')}${b('×', op, '*')}
                    ${b('1', num, '1')}${b('2', num, '2')}${b('3', num, '3')}${b('−', op, '-')}
                    ${b('0', num, '0')}${b('.', num, '.')}${b('%', gris, '%')}${b('+', op, '+')}
                    ${b('=', 'bg-slate-800 text-white hover:bg-slate-900 shadow-md', '=', 'col-span-2')}
                    <button type="button" id="calc-copiar" data-k="COPIAR" class="col-span-2 py-3 md:py-2.5 rounded-lg font-bold text-sm bg-emerald-600 text-white hover:bg-emerald-700 shadow-md">📋 Copiar</button>
                </div>
                <p class="mt-2 text-[10px] text-slate-400 text-center hidden md:block">Escribe con el teclado · Enter calcula · Esc cierra</p>
            </div>`;
        document.body.appendChild(panel);
        input = panel.querySelector('#calc-display'); hist = panel.querySelector('#calc-hist'); btnCopiar = panel.querySelector('#calc-copiar');

        panel.addEventListener('click', (e) => { const k = e.target.closest('button[data-k]'); if (k) tecla(k.dataset.k); });
        panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); cerrar(); } });
        input.addEventListener('input', limpiarEntrada);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); calcular(); }
            else if (recienEvaluado && /^[0-9.,]$/.test(e.key)) { input.value = ''; recienEvaluado = false; hist.innerText = ''; }
            else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) recienEvaluado = false;
        });
        arrastrable(panel.querySelector('#calc-barra'));
        window.addEventListener('resize', () => { if (!panel.classList.contains('hidden')) ubicar(); });
    }

    // Solo deja pasar lo que una cuenta necesita (coma = punto decimal, x = por)
    function limpiarEntrada() {
        const antes = input.value, pos = input.selectionStart;
        let v = antes.replace(/,/g, '.').replace(/[xX×]/g, '*').replace(/[:÷]/g, '/').replace(/[−–]/g, '-').replace(/[^0-9+\-*/().%\s]/g, '');
        if (v !== antes) { input.value = v; try { input.setSelectionRange(pos - (antes.length - v.length), pos - (antes.length - v.length)); } catch (e) { /* sin selección */ } }
    }

    function tecla(k) {
        if (k === 'cerrar') return cerrar();
        if (k === 'C') { input.value = '0'; hist.innerText = ''; ultimo = null; recienEvaluado = false; return; }
        if (k === 'DEL') { if (recienEvaluado) { input.value = '0'; recienEvaluado = false; return; } input.value = input.value.length > 1 ? input.value.slice(0, -1) : '0'; return; }
        if (k === '=') return calcular();
        if (k === 'COPIAR') return copiar();
        const esDigito = /^[0-9.]$/.test(k);
        if (recienEvaluado && esDigito) { input.value = ''; hist.innerText = ''; }
        recienEvaluado = false;
        if (input.value === '0' || input.value === 'Error') input.value = (k === '.' ? '0.' : (/^[0-9]$/.test(k) || k === '(' ? k : '0' + k));
        else input.value += k;
        if (punteroFino()) input.focus();
    }

    function calcular() {
        const expr = input.value;
        try {
            const r = evaluar(expr);
            hist.innerText = expr + ' ='; input.value = String(r); ultimo = r; recienEvaluado = true; return r;
        } catch (e) { input.value = 'Error'; ultimo = null; recienEvaluado = false; return null; }
    }

    async function copiar() {
        let r = recienEvaluado ? ultimo : calcular();
        if (r === null || r === undefined) return;
        const txt = String(r);
        try { await navigator.clipboard.writeText(txt); }
        catch (e) {
            const t = document.createElement('textarea'); t.value = txt; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); } catch (e2) { /* sin permiso */ } t.remove();
        }
        btnCopiar.innerText = '✓ Copiado'; btnCopiar.classList.replace('bg-emerald-600', 'bg-emerald-800');
        setTimeout(() => { btnCopiar.innerText = '📋 Copiar'; btnCopiar.classList.replace('bg-emerald-800', 'bg-emerald-600'); }, 1400);
    }

    // ---------- Posición ----------
    function leerPos() { try { const p = JSON.parse(localStorage.getItem(LS) || 'null'); if (p && isFinite(p.x) && isFinite(p.y)) return p; } catch (e) { /* sin guardado */ } return null; }
    function guardarPos(x, y) { try { localStorage.setItem(LS, JSON.stringify({ x, y })); } catch (e) { /* sin guardado */ } }
    function ubicar() {
        if (esTelefono()) {                       // teléfono: fija abajo, ancho completo
            panel.classList.remove('rounded-2xl'); panel.classList.add('rounded-t-2xl', 'rounded-b-none'); panel.style.width = '100%';
            panel.style.left = '0'; panel.style.top = 'auto'; panel.style.bottom = '0'; panel.style.right = '0';
            return;
        }
        panel.classList.add('rounded-2xl'); panel.classList.remove('rounded-t-2xl', 'rounded-b-none'); panel.style.width = '288px';
        panel.style.bottom = 'auto'; panel.style.right = 'auto';
        const p = leerPos(), w = panel.offsetWidth || 288, h = panel.offsetHeight || 420;
        const x = p ? p.x : window.innerWidth - w - 24, y = p ? p.y : 72;
        panel.style.left = Math.max(0, Math.min(x, window.innerWidth - w)) + 'px';
        panel.style.top = Math.max(0, Math.min(y, window.innerHeight - Math.min(h, window.innerHeight))) + 'px';
    }
    function arrastrable(barra) {
        let d = null;
        barra.addEventListener('pointerdown', (e) => {
            if (esTelefono() || e.target.closest('button')) return;
            d = { dx: e.clientX - panel.offsetLeft, dy: e.clientY - panel.offsetTop };
            barra.setPointerCapture(e.pointerId); e.preventDefault();
        });
        barra.addEventListener('pointermove', (e) => {
            if (!d) return;
            const x = Math.max(0, Math.min(e.clientX - d.dx, window.innerWidth - panel.offsetWidth));
            const y = Math.max(0, Math.min(e.clientY - d.dy, window.innerHeight - 48));
            panel.style.left = x + 'px'; panel.style.top = y + 'px';
        });
        const fin = () => { if (d) { guardarPos(panel.offsetLeft, panel.offsetTop); d = null; } };
        barra.addEventListener('pointerup', fin); barra.addEventListener('pointercancel', fin);
    }

    // ---------- Abrir / cerrar ----------
    function cerrar() { if (panel) panel.classList.add('hidden'); }
    window.toggleCalculadora = function () {
        construir();
        const abrir = panel.classList.contains('hidden');
        if (!abrir) return cerrar();
        ['panel-notificaciones', 'user-dropdown'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        panel.classList.remove('hidden'); ubicar();
        input.setAttribute('inputmode', punteroFino() ? 'decimal' : 'none');
        if (punteroFino()) { input.focus(); input.select(); }
    };
    window._calcEvaluar = evaluar;   // para pruebas
})();

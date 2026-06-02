import React, { useEffect, useState, useMemo } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  orderBy
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./App.css";

/* --- COMPONENTE DE AUTORIZACIÓN (ROLE GUARD) --- */
const RoleGuard = ({ user, allowedRoles, children, fallback = null }) => {
  if (user && allowedRoles.includes(user.rol)) {
    return children;
  }
  return fallback;
};

function App() {
  const [usuario, setUsuario] = useState(null);
  const [datosUsuario, setDatosUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  // NAVEGACIÓN WEB 2.0
  const [vista, setVista] = useState("ventas");
  const [subVista, setSubVista] = useState("historial");

  // FILTROS Y ESTADOS DE ANÁLISIS
  const [filtroSucursal, setFiltroSucursal] = useState("");
  const [filtroMes, setFiltroMes] = useState("");
  const [filtroUltimos10, setFiltroUltimos10] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [sucursalDetalle, setSucursalDetalle] = useState(null);
  const [fechaCalendario, setFechaCalendario] = useState(null);
  const [mesVista, setMesVista] = useState(new Date());

  // Catálogos y Datos
  const [sucursales, setSucursales] = useState(["Lebu", "Los Álamos", "Cañete"]);
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState("");
  const [tiposVenta, setTiposVenta] = useState(["S/B", "Boleta", "Factura", "Transferencia", "Debito/Credito"]);
  const [ventasRaw, setVentasRaw] = useState([]);
  const [comunicaciones, setComunicaciones] = useState([]);

  // ESTADOS FORMULARIO COMUNICACIONES (ADMIN)
  const [tituloCom, setTituloCom] = useState("");
  const [contenidoCom, setContenidoCom] = useState("");
  const [prioridadCom, setPrioridadCom] = useState("Media");
  const [alcanceCom, setAlcanceCom] = useState("Todas");

  // MÉTRICAS WEB 2.1
  const [metricasWeb, setMetricasWeb] = useState({
    anualGlobal: 0,
    mensualSucursal: {},
    semanalEvolucion: [0, 0, 0, 0, 0, 0, 0],
    tendenciaSemana: 0,
    tendenciaMes: 0,
    mejorSucursalMes: "-",
    totalSemanaActual: 0,
    promedioDiarioSemanal: 0
  });

  // --- FUNCIONES AUXILIARES ---
  const obtenerFechaActual = () => {
    const hoy = new Date();
    return String(hoy.getDate()).padStart(2, '0') + '/' +
           String(hoy.getMonth() + 1).padStart(2, '0') + '/' +
           hoy.getFullYear();
  };

  const formatearFecha = (fechaOriginal) => {
    if (!fechaOriginal) return "00/00/0000";
    let stringBase = "";
    if (typeof fechaOriginal === 'string') {
      stringBase = fechaOriginal;
    } else if (fechaOriginal.seconds) {
      const d = new Date(fechaOriginal.seconds * 1000);
      stringBase = String(d.getDate()).padStart(2, '0') + '/' +
                   String(d.getMonth() + 1).padStart(2, '0') + '/' +
                   d.getFullYear();
    } else { return "Fecha Inválida"; }
    return stringBase.split(" ")[0].trim();
  };

  const formatearFechaHoraLong = (ms) => {
    if (!ms) return "";
    const d = new Date(ms);
    return d.toLocaleDateString("es-CL") + " " + d.toLocaleTimeString("es-CL", { hour: '2-digit', minute: '2-digit' });
  };

  const sanitizarTipoParaId = (tipo) => {
    if (!tipo) return "Otros";
    return tipo
      .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
      .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U")
      .replace(/\//g, "").replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
  };

  // --- PROCESAMIENTO DE SUCURSALES WEB 2.0 ---
  const sucursalesMetricas = useMemo(() => {
    const ahora = new Date();
    const añoActual = ahora.getFullYear();
    const mesActual = ahora.getMonth();
    const mesAnteriorDate = new Date(añoActual, mesActual - 1, 1);
    const mesAnterior = mesAnteriorDate.getMonth();
    const añoMesAnterior = mesAnteriorDate.getFullYear();
    const stats = {};
    sucursales.forEach(s => { stats[s] = { anual: 0, mensual: 0, mensualAnterior: 0, cierresCount: 0, distribucion: {}, calendario: {} }; });
    ventasRaw.forEach(v => {
      if (!stats[v.sucursal]) return;
      const [d, m, y] = v.fecha.split("/");
      const fVenta = new Date(y, m - 1, d);
      const monto = Number(v.total) || 0;
      if (fVenta.getFullYear() === añoActual) stats[v.sucursal].anual += monto;
      if (fVenta.getFullYear() === añoActual && fVenta.getMonth() === mesActual) stats[v.sucursal].mensual += monto;
      else if (fVenta.getFullYear() === añoMesAnterior && fVenta.getMonth() === mesAnterior) stats[v.sucursal].mensualAnterior += monto;
      if (!stats[v.sucursal].calendario[v.fecha]) { stats[v.sucursal].calendario[v.fecha] = { total: 0, registros: [] }; stats[v.sucursal].cierresCount++; }
      stats[v.sucursal].calendario[v.fecha].total += monto;
      stats[v.sucursal].calendario[v.fecha].registros.push(v);
      stats[v.sucursal].distribucion[v.tipo] = (stats[v.sucursal].distribucion[v.tipo] || 0) + monto;
    });
    return stats;
  }, [ventasRaw, sucursales]);

  // --- MOTOR DE ALERTAS ---
  const alertasOperacionales = useMemo(() => {
    const alertas = [];
    const hoyStr = obtenerFechaActual();
    const ahora = new Date();
    const stats = {};
    sucursales.forEach(s => stats[s] = { hoy: 0, diarios: {}, tipos: {} });
    ventasRaw.forEach(v => {
      if (!stats[v.sucursal]) return;
      const [d, m, y] = v.fecha.split("/");
      const fVenta = new Date(y, m - 1, d);
      const diffDias = Math.floor((ahora - fVenta) / (1000 * 60 * 60 * 24));
      const monto = Number(v.total) || 0;
      if (v.fecha === hoyStr) { stats[v.sucursal].hoy += monto; stats[v.sucursal].tipos[v.tipo] = (stats[v.sucursal].tipos[v.tipo] || 0) + monto; }
      if (diffDias > 0 && diffDias <= 14) stats[v.sucursal].diarios[v.fecha] = (stats[v.sucursal].diarios[v.fecha] || 0) + monto;
    });
    sucursales.forEach(s => {
      const st = stats[s];
      if (st.hoy === 0) alertas.push({ id: `no-data-${s}`, sucursal: s, mensaje: `${s} no registra cierres hoy`, prioridad: "alta", icono: "⚠️" });
      const historico = Object.entries(st.diarios).sort((a, b) => { const [da, ma, ya] = a[0].split("/"); const [db, mb, yb] = b[0].split("/"); return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da); }).map(x => x[1]);
      const avg7d = historico.slice(0, 7).reduce((a, b) => a + b, 0) / 7;
      if (st.hoy > 0 && avg7d > 0) { const caida = ((avg7d - st.hoy) / avg7d) * 100; if (caida >= 40) alertas.push({ id: `caida-${s}`, sucursal: s, mensaje: `${s} cayó ${Math.round(caida)}% respecto al promedio semanal`, prioridad: "alta", icono: "▼" }); }
      if (st.hoy > 0 && historico.length >= 2) { if (st.hoy < historico[0] && historico[0] < historico[1]) alertas.push({ id: `trend-${s}`, sucursal: s, mensaje: `${s} registra tendencia negativa por 3 días`, prioridad: "media", icono: "📉" }); }
      if (st.hoy > 0) { Object.entries(st.tipos).forEach(([tipo, monto]) => { const perc = (monto / st.hoy) * 100; if (perc > 85) alertas.push({ id: `extreme-${s}-${tipo}`, sucursal: s, mensaje: `${tipo} representa ${Math.round(perc)}% de las ventas en ${s}`, prioridad: "baja", icono: "⚖️" }); }); }
    });
    return alertas;
  }, [ventasRaw, sucursales]);

  // --- HISTORIAL COMPARATIVO ---
  const historialComparativo = useMemo(() => {
    const hoy = new Date();
    const diezDiasAtras = new Date(); diezDiasAtras.setDate(hoy.getDate() - 10); diezDiasAtras.setHours(0,0,0,0);
    const filtradas = ventasRaw.filter(v => {
      const [d, m, y] = v.fecha.split("/"); const fVenta = new Date(y, m - 1, d);
      if (filtroSucursal !== "" && v.sucursal !== filtroSucursal) return false;
      if (filtroUltimos10 && fVenta < diezDiasAtras) return false;
      if (!filtroUltimos10 && filtroMes !== "") { const mesVenta = `${m}/${y}`; if (mesVenta !== filtroMes) return false; }
      return true;
    });
    const filas = {};
    filtradas.forEach(v => {
      if (!filas[v.fecha]) filas[v.fecha] = { fecha: v.fecha, montosPorSucursal: {}, totalDia: 0, registrosPorSucursal: {} };
      filas[v.fecha].montosPorSucursal[v.sucursal] = (filas[v.fecha].montosPorSucursal[v.sucursal] || 0) + (Number(v.total) || 0);
      filas[v.fecha].totalDia += (Number(v.total) || 0);
      if (!filas[v.fecha].registrosPorSucursal[v.sucursal]) filas[v.fecha].registrosPorSucursal[v.sucursal] = [];
      filas[v.fecha].registrosPorSucursal[v.sucursal].push(v);
    });
    return Object.values(filas).sort((a, b) => { const [da, ma, ya] = a.fecha.split("/"); const [db, mb, yb] = b.fecha.split("/"); return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da); });
  }, [ventasRaw, filtroSucursal, filtroMes, filtroUltimos10]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setUsuario(user);
          setDatosUsuario({ ...data, sucursalAsignada: data.sucursalAsignada || "" });
          if (data.rol === "vendedor" && data.sucursalAsignada) setSucursalSeleccionada(data.sucursalAsignada);
          if (data.estado === "aprobado") setFechaCierre(obtenerFechaActual());
        } else {
          const perfilBasico = { nombre: user.displayName || "Usuario", email: user.email, rol: "vendedor", estado: "pendiente", sucursalAsignada: "" };
          await setDoc(userRef, perfilBasico);
          setUsuario(user); setDatosUsuario(perfilBasico);
        }
      } else { setUsuario(null); setDatosUsuario(null); }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!usuario || datosUsuario?.estado !== "aprobado") return;
    const cargarCatalogos = async () => {
      try {
        const sRef = doc(db, "catalogos", "sucursales");
        const tRef = doc(db, "catalogos", "tipos_venta");
        const [sSnap, tSnap] = await Promise.all([getDoc(sRef), getDoc(tRef)]);
        if (sSnap.exists()) {
          const items = sSnap.data().items; setSucursales(items);
          if (datosUsuario.rol === "admin") setSucursalSeleccionada(items[0]);
          else if (datosUsuario.rol === "vendedor" && datosUsuario.sucursalAsignada) setSucursalSeleccionada(datosUsuario.sucursalAsignada);
        }
        if (tSnap.exists()) {
          const items = tSnap.data().items; setTiposVenta(items);
          const initialInputs = {}; items.forEach(t => initialInputs[t] = ""); setVentasInputs(initialInputs);
        }
      } catch (e) { console.error("Error catálogos:", e); }
    };
    const qV = query(collection(db, "ventas"), orderBy("lastUpdated", "desc"));
    const unsubVentas = onSnapshot(qV, (snap) => {
      let dataRaw = snap.docs.map(d => ({ id: d.id, ...d.data(), fecha: formatearFecha(d.data().fecha) }));
      if (datosUsuario.rol === "vendedor" && datosUsuario.sucursalAsignada) dataRaw = dataRaw.filter(v => v.sucursal === datosUsuario.sucursalAsignada);
      setVentasRaw(dataRaw);
      const ahora = new Date(); const añoActual = ahora.getFullYear(); const mesActual = ahora.getMonth(); const diaSemana = ahora.getDay();
      const diffLun = ahora.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
      const lunesActual = new Date(new Date().setDate(diffLun)); lunesActual.setHours(0,0,0,0);
      const lunesAnterior = new Date(lunesActual); lunesAnterior.setDate(lunesAnterior.getDate() - 7);
      const mesAnteriorDate = new Date(añoActual, mesActual - 1, 1); const mesAnterior = mesAnteriorDate.getMonth(); const añoMesAnterior = mesAnteriorDate.getFullYear();
      let totalAnual = 0; let totalMesActual = 0; let totalMesAnterior = 0; let totalSemanaActual = 0; let totalSemanaAnterior = 0;
      let mesSucursal = { "Lebu": 0, "Los Álamos": 0, "Cañete": 0 }; let evolucionSemanal = [0, 0, 0, 0, 0, 0, 0];
      dataRaw.forEach(v => {
        const [d, m, y] = v.fecha.split("/"); const fechaVenta = new Date(y, m - 1, d); const monto = Number(v.total) || 0;
        if (fechaVenta.getFullYear() === añoActual) totalAnual += monto;
        if (fechaVenta.getFullYear() === añoActual && fechaVenta.getMonth() === mesActual) { totalMesActual += monto; if (mesSucursal.hasOwnProperty(v.sucursal)) mesSucursal[v.sucursal] += monto; }
        else if (fechaVenta.getFullYear() === añoMesAnterior && fechaVenta.getMonth() === mesAnterior) totalMesAnterior += monto;
        if (fechaVenta >= lunesActual) { totalSemanaActual += monto; let idx = fechaVenta.getDay(); let corr = idx === 0 ? 6 : idx - 1; if (corr >= 0 && corr <= 6) evolucionSemanal[corr] += monto; }
        else if (fechaVenta >= lunesAnterior && fechaVenta < lunesActual) totalSemanaAnterior += monto;
      });
      const calcularTendencia = (act, ant) => ant === 0 ? (act > 0 ? 100 : 0) : ((act - ant) / ant) * 100;
      const mejorSuc = Object.entries(mesSucursal).reduce((a, b) => b[1] > a[1] ? b : a, ["-", 0])[0];
      setMetricasWeb({
        anualGlobal: totalAnual, mensualSucursal: mesSucursal, semanalEvolucion: evolucionSemanal,
        tendenciaSemana: calcularTendencia(totalSemanaActual, totalSemanaAnterior),
        tendenciaMes: calcularTendencia(totalMesActual, totalMesAnterior),
        mejorSucursalMes: mejorSuc, totalSemanaActual: totalSemanaActual,
        promedioDiarioSemanal: totalSemanaActual / (diaSemana === 0 ? 7 : diaSemana)
      });
    });
    const qC = query(collection(db, "comunicaciones"), orderBy("fecha", "desc"));
    const unsubComs = onSnapshot(qC, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setComunicaciones(data);
    });
    cargarCatalogos(); return () => { unsubVentas(); unsubComs(); };
  }, [usuario, datosUsuario]);

  const [ventasInputs, setVentasInputs] = useState({});
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [fechaCierre, setFechaCierre] = useState("");

  useEffect(() => {
    const suma = Object.values(ventasInputs).reduce((acc, val) => acc + (Number(val) || 0), 0);
    setTotalGeneral(suma);
  }, [ventasInputs]);

  const manejarCambioInput = (tipo, valor) => setVentasInputs(prev => ({ ...prev, [tipo]: valor }));

  const limpiarFormulario = () => {
    if (window.confirm("¿Desea limpiar todos los datos ingresados?")) {
      const reset = {}; tiposVenta.forEach(t => reset[t] = ""); setVentasInputs(reset);
      if (datosUsuario.rol !== "vendedor") setSucursalSeleccionada(sucursales[0] || "");
    }
  };

  const guardarCierre = async (e) => {
    e.preventDefault(); if (totalGeneral === 0) return alert("Ingrese montos.");
    try {
      const fechaID = fechaCierre.replace(/\//g, "-");
      const promesas = Object.entries(ventasInputs).map(([tipo, valor]) => {
        const monto = Number(valor) || 0; if (monto === 0) return null;
        const docID = `${fechaID}_${sucursalSeleccionada}_${sanitizarTipoParaId(tipo)}`;
        return setDoc(doc(db, "ventas", docID), {
          fecha: fechaCierre, sucursal: sucursalSeleccionada.trim(), tipo: tipo.trim(), total: monto,
          usuario: usuario.displayName || usuario.email, usuarioId: usuario.uid, lastUpdated: Date.now()
        });
      });
      await Promise.all(promesas.filter(p => p !== null));
      alert("Ventas sincronizadas exitosamente.");
      const reset = {}; tiposVenta.forEach(t => reset[t] = ""); setVentasInputs(reset);
    } catch (e) { alert("Error de conexión o permisos denegados."); }
  };

  // --- FUNCIÓN PUBLICAR COMUNICACIÓN (SOLO ADMIN) ---
  const publicarComunicacion = async (e) => {
    e.preventDefault();
    if (!tituloCom || !contenidoCom) return alert("Título y Contenido obligatorios.");
    try {
      const nuevaCom = {
        titulo: tituloCom.trim(),
        contenido: contenidoCom.trim(),
        autor: usuario.displayName || usuario.email,
        fecha: Date.now(), // Long compatible con Android
        prioridad: prioridadCom,
        alcance: alcanceCom,
        leidoPor: [], // Estándar Android
        completadoPor: [] // Estándar Android
      };
      await addDoc(collection(db, "comunicaciones"), nuevaCom);
      alert("Comunicación publicada ✔");
      setTituloCom(""); setContenidoCom("");
    } catch (e) { alert("Error al publicar."); }
  };

  const eliminarRegistro = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este registro?")) return;
    try { await deleteDoc(doc(db, "ventas", id)); alert("Registro eliminado."); } catch (e) { alert("Error al eliminar."); }
  };

  const iniciarSesion = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert("Error login"); }
  };

  if (loading) return <div className="loader-screen"><h1>Cargando sistema...</h1></div>;
  if (!usuario) return (<div className="login-page"><div className="login-card"><h1>Gestor Pro</h1><p>Inicie sesión para continuar</p><button onClick={iniciarSesion} className="btn-google">Entrar con Google</button></div></div>);
  if (datosUsuario && datosUsuario.estado !== "aprobado") return (<div className="login-page"><div className="login-card"><h2 style={{color: datosUsuario.estado === "rechazado" ? "red" : "orange"}}>Acceso {datosUsuario.estado === "rechazado" ? "Rechazado" : "Restringido"}</h2><p>Tu cuenta ({usuario.email}) está en estado "{datosUsuario.estado}".</p><button onClick={() => signOut(auth)} className="btn-logout">Cerrar Sesión</button></div></div>);

  const esAdmin = datosUsuario?.rol === "admin";
  const puedeEditarFecha = esAdmin || datosUsuario?.rol === "super_usuario";

  const renderContenido = () => {
    switch (vista) {
      case "ventas":
        return (
          <div className="ventas-view-layout">
            {/* PANEL CREACIÓN (SOLO ADMIN) */}
            {esAdmin && (
              <section className="card admin-publish-panel">
                <h3>📢 Nueva Comunicación</h3>
                <form onSubmit={publicarComunicacion} className="publish-form">
                  <div className="publish-grid">
                    <input type="text" placeholder="Título del mensaje..." value={tituloCom} onChange={(e) => setTituloCom(e.target.value)} required />
                    <select value={prioridadCom} onChange={(e) => setPrioridadCom(e.target.value)}>
                      <option value="Baja">Prioridad Baja</option>
                      <option value="Media">Prioridad Media</option>
                      <option value="Alta">Prioridad Alta</option>
                    </select>
                    <select value={alcanceCom} onChange={(e) => setAlcanceCom(e.target.value)}>
                      <option value="Todas">Todas las Sucursales</option>
                      {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <textarea placeholder="Escriba la instrucción o aviso aquí..." value={contenidoCom} onChange={(e) => setContenidoCom(e.target.value)} required rows="3"></textarea>
                  <button type="submit" className="btn-save">Publicar en el Muro</button>
                </form>
              </section>
            )}

            {comunicaciones.length > 0 && (
              <section className="comms-muro-web">
                <div className="muro-header-mini">Muro de Comunicaciones</div>
                <div className="muro-scroll-container">
                  {comunicaciones
                    .filter(m => m.alcance === "Todas" || m.alcance === datosUsuario?.sucursalAsignada || esAdmin)
                    .map(msg => (
                      <div key={msg.id} className={`comm-pill ${msg.prioridad?.toLowerCase()}`}>
                        <div className="pill-top"><span className="pill-prio-dot"></span><span className="pill-title">{msg.titulo}</span><span className="pill-date">{formatearFechaHoraLong(msg.fecha)}</span></div>
                        <p className="pill-content">{msg.contenido}</p>
                        <div className="pill-footer">Por: {msg.autor} • {msg.alcance}</div>
                      </div>
                    ))}
                </div>
              </section>
            )}
            <section className="card form-section">
              <h2>Registrar Cierre</h2>
              <form onSubmit={guardarCierre}>
                <div className="top-inputs">
                  <div className="field"><label>Sucursal</label><select value={sucursalSeleccionada} onChange={(e) => setSucursalSeleccionada(e.target.value)} disabled={!esAdmin}>{sucursales.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                  <div className="field"><label>Fecha</label><input type="text" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} disabled={!puedeEditarFecha} /></div>
                </div>
                <div className="ventas-inputs-grid">{tiposVenta.map(tipo => (<div className="field" key={tipo}><label>{tipo}</label><input type="number" placeholder="0" value={ventasInputs[tipo] || ""} onChange={(e) => manejarCambioInput(tipo, e.target.value)} /></div>))}</div>
                <div className="summary-bar">
                  <div className="total-box"><span className="label">Total:</span><span className="amount">${totalGeneral.toLocaleString("es-CL")}</span></div>
                  <div className="form-actions"><button type="submit" className="btn-save">Guardar Cierre Diario</button><button type="button" onClick={limpiarFormulario} className="btn-clean">Limpiar</button></div>
                </div>
              </form>
            </section>
          </div>
        );
      case "analisis":
        if (!esAdmin) { setVista("ventas"); return null; }
        return (
          <div className="analisis-layout">
            <nav className="sub-nav"><button className={subVista === "historial" ? "active" : ""} onClick={() => setSubVista("historial")}>Historial</button><button className={subVista === "metricas" ? "active" : ""} onClick={() => setSubVista("metricas")}>Métricas</button><button className={subVista === "sucursales" ? "active" : ""} onClick={() => setSubVista("sucursales")}>Sucursales</button><button className={subVista === "alertas" ? "active" : ""} onClick={() => setSubVista("alertas")}>Alertas</button></nav>
            <div className="sub-vista-content">
              {subVista === "historial" && (
                <section className="history-comparative">
                  <div className="filters-bar card">
                    <div className="filter-item"><label>Sucursal</label><select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}><option value="">Todas las sucursales</option>{sucursales.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="filter-item"><label>Rango</label><div className="toggle-filters"><button className={filtroUltimos10 ? "active" : ""} onClick={() => setFiltroUltimos10(true)}>Últimos 10 días</button><button className={!filtroUltimos10 ? "active" : ""} onClick={() => setFiltroUltimos10(false)}>Ver todos</button></div></div>
                  </div>
                  <div className="table-responsive-container card"><table className="comparative-table"><thead><tr><th>Fecha</th>{sucursales.map(s => <th key={s}>{s}</th>)}<th className="col-total">Total Día</th></tr></thead><tbody>{historialComparativo.map(fila => { const canExpand = filtroSucursal !== ""; const isExpanded = canExpand && expandedId === fila.fecha; return (<React.Fragment key={fila.fecha}><tr><td className={`cell-date ${canExpand ? 'clickable' : ''}`} onClick={() => canExpand && setExpandedId(isExpanded ? null : fila.fecha)}>{fila.fecha}</td>{sucursales.map(s => (<td key={s} className="cell-amount">{fila.montosPorSucursal[s] ? `$${fila.montosPorSucursal[s].toLocaleString("es-CL")}` : "-"}</td>))}<td className="cell-total-dia">${fila.totalDia.toLocaleString("es-CL")}</td></tr>{isExpanded && fila.registrosPorSucursal[filtroSucursal] && (<tr className="detail-row"><td colSpan={sucursales.length + 2}><div className="table-detail-content"><div className="detail-header-mini">Desglose de {filtroSucursal} - {fila.fecha}</div><div className="detail-items-grid">{fila.registrosPorSucursal[filtroSucursal].map(reg => (<div key={reg.id} className="detail-item-pill"><span className="pill-type">{reg.tipo}</span><span className="pill-amount">${Number(reg.total).toLocaleString("es-CL")}</span><button onClick={() => eliminarRegistro(reg.id)} className="btn-delete-x">×</button></div>))}</div></div></td></tr>)}</React.Fragment>); })}</tbody></table></div>
                </section>
              )}
              {subVista === "metricas" && (
                <div className="metricas-web-view">
                  <div className="executive-summary-top"><div className="card summary-mini-card blue"><span className="label">Mejor Sucursal Mes</span><strong>{metricasWeb.mejorSucursalMes}</strong></div><div className="card summary-mini-card purple"><span className="label">Semana Actual</span><strong>${metricasWeb.totalSemanaActual.toLocaleString("es-CL")}</strong></div><div className="card summary-mini-card yellow"><span className="label">Promedio Diario Semanal</span><strong>${Math.round(metricasWeb.promedioDiarioSemanal).toLocaleString("es-CL")}</strong></div></div>
                  <div className="metricas-header-anual"><div className="card stat-card-full"><div className="stat-main"><span className="label">Ventas Acumuladas Año Actual</span><h2 className="amount-hero">${metricasWeb.anualGlobal.toLocaleString("es-CL")}</h2></div><div className={`trend-badge ${metricasWeb.tendenciaMes >= 0 ? 'up' : 'down'}`}>{metricasWeb.tendenciaMes >= 0 ? '▲' : '▼'} {Math.abs(Math.round(metricasWeb.tendenciaMes))}%<span className="trend-label">vs mes anterior</span></div></div></div>
                  <div className="metricas-grid-sucursales">{sucursales.map(suc => (<div key={suc} className="card stat-card-sucursal"><div className="suc-info"><span className="label">Mes Actual</span><h3 className="suc-name">{suc}</h3></div><h3 className="amount-suc">${(metricasWeb.mensualSucursal[suc] || 0).toLocaleString("es-CL")}</h3><div className="progress-bar-bg"><div className="progress-bar-fill" style={{width: `${Math.min(((metricasWeb.mensualSucursal[suc] || 0) / (metricasWeb.anualGlobal / 4 || 1)) * 100, 100)}%`}}></div></div></div>))}</div>
                  <div className="card evolution-card"><div className="evolution-header"><h3>Evolución Semanal</h3><div className={`trend-badge mini ${metricasWeb.tendenciaSemana >= 0 ? 'up' : 'down'}`}>{metricasWeb.tendenciaSemana >= 0 ? '▲' : '▼'} {Math.abs(Math.round(metricasWeb.tendenciaSemana))}%</div></div><div className="bar-chart-semanal">{["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"].map((dia, idx) => { const esHoy = (new Date().getDay() === (idx === 6 ? 0 : idx + 1)); return (<div key={dia} className={`chart-col ${esHoy ? 'today' : ''}`}><span className="val-text">${(metricasWeb.semanalEvolucion[idx] || 0).toLocaleString("es-CL")}</span><div className="chart-bar-fill" style={{height: `${Math.min((metricasWeb.semanalEvolucion[idx] / (Math.max(...metricasWeb.semanalEvolucion) || 1)) * 140, 140)}px`}}></div><span className="chart-label">{dia}</span></div>); })}</div></div>
                </div>
              )}
              {subVista === "sucursales" && (
                <div className="sucursales-web-view">
                  {!sucursalDetalle ? (<div className="sucursales-grid-main">{sucursales.map(s => { const m = sucursalesMetricas[s]; const tend = ((m.mensual - m.mensualAnterior) / (m.mensualAnterior || 1)) * 100; return (<div key={s} className="card sucursal-exec-card" onClick={() => setSucursalDetalle(s)}><div className="s-card-header"><h3>{s}</h3><div className={`trend-indicator ${tend >= 0 ? 'up' : 'down'}`}>{tend >= 0 ? '▲' : '▼'} {Math.abs(Math.round(tend))}%</div></div><div className="s-card-stats"><div className="s-stat"><span className="label">Total Mes</span><strong>${m.mensual.toLocaleString("es-CL")}</strong></div><div className="s-stat"><span className="label">Total Año</span><strong>${m.anual.toLocaleString("es-CL")}</strong></div></div><div className="s-card-footer"><span>{m.cierresCount} cierres registrados</span><button className="btn-view">Ver Detalle</button></div></div>); })}</div>) : (
                    <div className="sucursal-detail-view"><header className="detail-header"><button className="btn-back" onClick={() => {setSucursalDetalle(null); setFechaCalendario(null)}}>← Volver</button><h2>{sucursalDetalle}</h2></header><div className="detail-summary-grid"><div className="card summary-box"><span className="label">Total Año</span><strong>${sucursalesMetricas[sucursalDetalle].anual.toLocaleString("es-CL")}</strong></div><div className="card summary-box"><span className="label">Total Mes</span><strong>${sucursalesMetricas[sucursalDetalle].mensual.toLocaleString("es-CL")}</strong></div><div className="card summary-box"><span className="label">Promedio Diario</span><strong>${Math.round(sucursalesMetricas[sucursalDetalle].anual / (sucursalesMetricas[sucursalDetalle].cierresCount || 1)).toLocaleString("es-CL")}</strong></div><div className="card summary-box"><span className="label">Cierres</span><strong>{sucursalesMetricas[sucursalDetalle].cierresCount}</strong></div></div><div className="detail-layout-columns"><div className="detail-col-left"><section className="card distribution-section"><h3>Distribución por Tipo de Venta</h3><div className="dist-list">{Object.entries(sucursalesMetricas[sucursalDetalle].distribucion).sort((a,b) => b[1] - a[1]).map(([tipo, total]) => { const perc = (total / (sucursalesMetricas[sucursalDetalle].anual || 1)) * 100; return (<div key={tipo} className="dist-item"><div className="dist-info"><span className="dist-name">{tipo}</span><span className="dist-perc">{Math.round(perc)}%</span></div><div className="dist-bar-bg"><div className="dist-bar-fill" style={{width: `${perc}%`}}></div></div><span className="dist-total">${total.toLocaleString("es-CL")}</span></div>); })}</div></section></div><div className="detail-col-right"><section className="card calendar-section"><div className="calendar-header-nav"><h3>Calendario</h3><div className="cal-nav-btns"><button onClick={() => setMesVista(new Date(mesVista.setMonth(mesVista.getMonth() - 1)))}>←</button><span>{mesVista.toLocaleString("es-CL", { month: 'long', year: 'numeric' }).toUpperCase()}</span><button onClick={() => setMesVista(new Date(mesVista.setMonth(mesVista.getMonth() + 1)))}>→</button></div></div><div className="calendar-grid-full">{["LU", "MA", "MI", "JU", "VI", "SA", "DO"].map(d => <div key={d} className="cal-day-label">{d}</div>)}{(() => { const start = new Date(mesVista.getFullYear(), mesVista.getMonth(), 1); const end = new Date(mesVista.getFullYear(), mesVista.getMonth() + 1, 0); const days = []; let firstDayIdx = start.getDay(); firstDayIdx = firstDayIdx === 0 ? 6 : firstDayIdx - 1; for (let i = 0; i < firstDayIdx; i++) days.push(<div key={`empty-${i}`} className="cal-day-empty"></div>); for (let d = 1; d <= end.getDate(); d++) { const fechaKey = `${String(d).padStart(2, '0')}/${String(mesVista.getMonth() + 1).padStart(2, '0')}/${mesVista.getFullYear()}`; const tieneVenta = sucursalesMetricas[sucursalDetalle].calendario[fechaKey]; days.push(<button key={d} className={`cal-day-box ${fechaCalendario === fechaKey ? 'active' : ''} ${tieneVenta ? 'has-data' : ''}`} onClick={() => setFechaCalendario(fechaCalendario === fechaKey ? null : fechaKey)}><span className="day-num">{d}</span>{tieneVenta && <span className="day-dot"></span>}</button>); } return days; })()}</div>{fechaCalendario && (<div className="day-detail-box"><h4>Detalle del {fechaCalendario}</h4>{sucursalesMetricas[sucursalDetalle].calendario[fechaCalendario] ? (<><div className="day-total-hero">${sucursalesMetricas[sucursalDetalle].calendario[fechaCalendario].total.toLocaleString("es-CL")}</div><div className="day-registros">{sucursalesMetricas[sucursalDetalle].calendario[fechaCalendario].registros.map(reg => (<div key={reg.id} className="day-reg-item"><span>{reg.tipo}</span><strong>${Number(reg.total).toLocaleString("es-CL")}</strong></div>))}</div></>) : <div className="no-data-msg">Sin registros para esta fecha</div>}<p className="read-only-note">Modo solo lectura</p></div>)}</section></div></div></div>
                  )}
                </div>
              )}
              {subVista === "alertas" && (
                <div className="alertas-web-view">
                  <h2 className="section-title">Alertas Operacionales</h2>
                  {alertasOperacionales.length === 0 ? ( <div className="card no-alerts-card"><span className="check-icon">✅</span><p>Sin alertas operacionales</p><small>El sistema no detectó irregularidades hoy.</small></div> ) : ( <div className="alertas-grid">{alertasOperacionales.map(alerta => (<div key={alerta.id} className={`alerta-card ${alerta.prioridad}`}><div className="alerta-icon">{alerta.icono}</div><div className="alerta-content"><span className="alerta-suc">{alerta.sucursal}</span><p className="alerta-msg">{alerta.mensaje}</p></div><div className="alerta-badge">{alerta.prioridad.toUpperCase()}</div></div>))}</div> )}
                </div>
              )}
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="dashboard-layout">
      <header className="navbar">
        <div className="nav-container">
          <span className="brand">ERP Edumaco 2.0</span>
          <div className="main-nav-tabs">
            <button className={vista === "ventas" ? "active" : ""} onClick={() => setVista("ventas")}>Ventas</button>
            {esAdmin && ( <button className={vista === "analisis" ? "active" : ""} onClick={() => setVista("analisis")}>Análisis</button> )}
          </div>
          <div className="user-nav"><div className="user-info-display"><span className="user-name">{usuario?.displayName || usuario?.email?.split('@')[0]}</span><span className="user-role-badge">{datosUsuario?.rol}</span></div><button onClick={() => signOut(auth)} className="btn-logout-nav">Cerrar Sesión</button></div>
        </div>
      </header>
      <main className="content-container">{renderContenido()}</main>
    </div>
  );
}

export default App;

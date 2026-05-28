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

  // FILTROS HISTORIAL EJECUTIVO
  const [filtroSucursal, setFiltroSucursal] = useState("");
  const [filtroMes, setFiltroMes] = useState(""); // vacío = todos
  const [filtroUltimos10, setFiltroUltimos10] = useState(true);
  const [expandedId, setExpandedId] = useState(null); // Control de expansión manual

  // Catálogos y Datos
  const [sucursales, setSucursales] = useState(["Lebu", "Los Álamos", "Cañete"]);
  const [tiposVenta, setTiposVenta] = useState(["S/B", "Boleta", "Factura", "Transferencia", "Debito/Credito"]);
  const [ventasRaw, setVentasRaw] = useState([]); // Guardamos ventas individuales para filtrar dinámicamente

  // MÉTRICAS WEB 2.0
  const [metricasWeb, setMetricasWeb] = useState({
    anualGlobal: 0,
    mensualSucursal: {},
    semanalEvolucion: [0, 0, 0, 0, 0, 0, 0]
  });

  // Estados del Formulario
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState("");
  const [ventasInputs, setVentasInputs] = useState({});
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [fechaCierre, setFechaCierre] = useState("");

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

  const sanitizarTipoParaId = (tipo) => {
    if (!tipo) return "Otros";
    return tipo
      .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i").replace(/ó/g, "o").replace(/ú/g, "u")
      .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I").replace(/Ó/g, "O").replace(/Ú/g, "U")
      .replace(/\//g, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setUsuario(user);
          setDatosUsuario(data);
          if (data.estado === "aprobado") {
            setFechaCierre(obtenerFechaActual());
          }
        } else {
          const perfilBasico = { nombre: user.displayName || "Usuario", email: user.email, rol: "vendedor", estado: "pendiente" };
          await setDoc(userRef, perfilBasico);
          setUsuario(user);
          setDatosUsuario(perfilBasico);
        }
      } else {
        setUsuario(null);
        setDatosUsuario(null);
      }
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
          setSucursales(sSnap.data().items);
          setSucursalSeleccionada(sSnap.data().items[0]);
        }
        if (tSnap.exists()) {
          const items = tSnap.data().items;
          setTiposVenta(items);
          const initialInputs = {};
          items.forEach(t => initialInputs[t] = "");
          setVentasInputs(initialInputs);
        }
      } catch (e) { console.error("Error catálogos:", e); }
    };

    const q = query(collection(db, "ventas"), orderBy("lastUpdated", "desc"));
    const unsubVentas = onSnapshot(q, (snap) => {
      const dataRaw = snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, fecha: formatearFecha(data.fecha) };
      });

      setVentasRaw(dataRaw);

      // --- LÓGICA DE MÉTRICAS WEB 2.0 ---
      const ahora = new Date();
      const añoActual = ahora.getFullYear();
      const mesActual = ahora.getMonth();
      const diaSemana = ahora.getDay();
      const diffLun = ahora.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
      const lunesActual = new Date(ahora.setDate(diffLun));
      lunesActual.setHours(0,0,0,0);

      let totalAnual = 0;
      let mesSucursal = { "Lebu": 0, "Los Álamos": 0, "Cañete": 0 };
      let evolucionSemanal = [0, 0, 0, 0, 0, 0, 0];

      dataRaw.forEach(v => {
        const [d, m, y] = v.fecha.split("/");
        const fechaVenta = new Date(y, m - 1, d);
        const monto = Number(v.total) || 0;

        if (fechaVenta.getFullYear() === añoActual) totalAnual += monto;
        if (fechaVenta.getFullYear() === añoActual && fechaVenta.getMonth() === mesActual) {
          if (mesSucursal.hasOwnProperty(v.sucursal)) mesSucursal[v.sucursal] += monto;
        }
        if (fechaVenta >= lunesActual) {
          let indiceDia = fechaVenta.getDay();
          let indiceCorregido = indiceDia === 0 ? 6 : indiceDia - 1;
          if (indiceCorregido >= 0 && indiceCorregido <= 6) evolucionSemanal[indiceCorregido] += monto;
        }
      });

      setMetricasWeb({
        anualGlobal: totalAnual,
        mensualSucursal: mesSucursal,
        semanalEvolucion: evolucionSemanal
      });
    });

    cargarCatalogos();
    return () => unsubVentas();
  }, [usuario, datosUsuario]);

  // --- LÓGICA DE FILTRADO Y AGRUPAMIENTO EJECUTIVO ---
  const cierresEjecutivos = useMemo(() => {
    const hoy = new Date();
    const diezDiasAtras = new Date();
    diezDiasAtras.setDate(hoy.getDate() - 10);
    diezDiasAtras.setHours(0,0,0,0);

    const filtradas = ventasRaw.filter(v => {
      const [d, m, y] = v.fecha.split("/");
      const fVenta = new Date(y, m - 1, d);

      // Filtro Sucursal
      if (filtroSucursal !== "" && v.sucursal !== filtroSucursal) return false;

      // Filtro 10 días
      if (filtroUltimos10 && fVenta < diezDiasAtras) return false;

      // Filtro Mes (si no está activo el de 10 días)
      if (!filtroUltimos10 && filtroMes !== "") {
        const mesVenta = `${m}/${y}`;
        if (mesVenta !== filtroMes) return false;
      }

      return true;
    });

    // Agrupar
    const grupos = {};
    filtradas.forEach(v => {
      const key = `${v.fecha}_${v.sucursal}`;
      if (!grupos[key]) {
        grupos[key] = {
          id: key,
          fecha: v.fecha,
          sucursal: v.sucursal,
          totalConsolidado: 0,
          registros: []
        };
      }
      grupos[key].totalConsolidado += (Number(v.total) || 0);
      grupos[key].registros.push(v);
    });

    return Object.values(grupos).sort((a, b) => {
      const [da, ma, ya] = a.fecha.split("/");
      const [db, mb, yb] = b.fecha.split("/");
      return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da); // Inverso (más reciente arriba)
    });
  }, [ventasRaw, filtroSucursal, filtroMes, filtroUltimos10]);

  useEffect(() => {
    const suma = Object.values(ventasInputs).reduce((acc, val) => acc + (Number(val) || 0), 0);
    setTotalGeneral(suma);
  }, [ventasInputs]);

  const manejarCambioInput = (tipo, valor) => {
    setVentasInputs(prev => ({ ...prev, [tipo]: valor }));
  };

  const guardarCierre = async (e) => {
    e.preventDefault();
    if (totalGeneral === 0) return alert("Ingrese montos.");

    try {
      const fechaID = fechaCierre.replace(/\//g, "-");
      const promesas = Object.entries(ventasInputs).map(([tipo, valor]) => {
        const monto = Number(valor) || 0;
        if (monto === 0) return null;
        const docID = `${fechaID}_${sucursalSeleccionada}_${sanitizarTipoParaId(tipo)}`;
        return setDoc(doc(db, "ventas", docID), {
          fecha: fechaCierre,
          sucursal: sucursalSeleccionada.trim(),
          tipo: tipo.trim(),
          total: monto,
          usuario: usuario.displayName || usuario.email,
          usuarioId: usuario.uid,
          lastUpdated: Date.now()
        });
      });
      await Promise.all(promesas.filter(p => p !== null));
      alert("Ventas sincronizadas exitosamente.");
      const reset = {};
      tiposVenta.forEach(t => reset[t] = "");
      setVentasInputs(reset);
    } catch (e) {
      alert("Error de conexión o permisos denegados.");
    }
  };

  const eliminarRegistro = async (id) => {
    if (!window.confirm("¿Seguro que desea eliminar este registro?")) return;
    try {
      await deleteDoc(doc(db, "ventas", id));
      alert("Registro eliminado.");
    } catch (e) {
      alert("Error al eliminar.");
    }
  };

  const iniciarSesion = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert("Error login"); }
  };

  if (loading) return <div className="loader-screen"><h1>Cargando sistema...</h1></div>;

  if (!usuario) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Gestor Pro</h1>
          <p>Inicie sesión para continuar</p>
          <button onClick={iniciarSesion} className="btn-google">Entrar con Google</button>
        </div>
      </div>
    );
  }

  if (datosUsuario && datosUsuario.estado !== "aprobado") {
    return (
      <div className="login-page">
        <div className="login-card">
          <h2 style={{color: datosUsuario.estado === "rechazado" ? "red" : "orange"}}>
            Acceso {datosUsuario.estado === "rechazado" ? "Rechazado" : "Restringido"}
          </h2>
          <p>Tu cuenta ({usuario.email}) está en estado "{datosUsuario.estado}".</p>
          <button onClick={() => signOut(auth)} className="btn-logout">Cerrar Sesión</button>
        </div>
      </div>
    );
  }

  const puedeEditarFecha = datosUsuario?.rol === "admin" || datosUsuario?.rol === "super_usuario";

  // --- RENDERIZADO DE CONTENIDO WEB 2.0 ---
  const renderContenido = () => {
    switch (vista) {
      case "ventas":
        return (
          <section className="card form-section">
            <h2>Registrar Cierre</h2>
            <form onSubmit={guardarCierre}>
              <div className="top-inputs">
                <div className="field">
                  <label>Sucursal</label>
                  <select value={sucursalSeleccionada} onChange={(e) => setSucursalSeleccionada(e.target.value)}>
                    {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Fecha</label>
                  <input type="text" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} disabled={!puedeEditarFecha} />
                </div>
              </div>
              <div className="ventas-inputs-grid">
                {tiposVenta.map(tipo => (
                  <div className="field" key={tipo}>
                    <label>{tipo}</label>
                    <input type="number" placeholder="0" value={ventasInputs[tipo] || ""} onChange={(e) => manejarCambioInput(tipo, e.target.value)} />
                  </div>
                ))}
              </div>
              <div className="summary-bar">
                <div className="total-box">
                  <span className="label">Total:</span>
                  <span className="amount">${totalGeneral.toLocaleString("es-CL")}</span>
                </div>
                <button type="submit" className="btn-save">Guardar Todo</button>
              </div>
            </form>
          </section>
        );

      case "analisis":
        return (
          <div className="analisis-layout">
            <nav className="sub-nav">
              <button className={subVista === "historial" ? "active" : ""} onClick={() => setSubVista("historial")}>Historial</button>
              <button className={subVista === "metricas" ? "active" : ""} onClick={() => setSubVista("metricas")}>Métricas</button>
              <button className={subVista === "sucursales" ? "active" : ""} onClick={() => setSubVista("sucursales")}>Sucursales</button>
              <button className={subVista === "alertas" ? "active" : ""} onClick={() => setSubVista("alertas")}>Alertas</button>
            </nav>

            <div className="sub-vista-content">
              {subVista === "historial" && (
                <section className="history-executive">
                  <div className="filters-bar card">
                    <div className="filter-item">
                      <label>Sucursal</label>
                      <select value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
                        <option value="">Todas las sucursales</option>
                        {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="filter-item">
                      <label>Rango</label>
                      <div className="toggle-filters">
                        <button className={filtroUltimos10 ? "active" : ""} onClick={() => setFiltroUltimos10(true)}>Últimos 10 días</button>
                        <button className={!filtroUltimos10 ? "active" : ""} onClick={() => setFiltroUltimos10(false)}>Ver todos</button>
                      </div>
                    </div>
                  </div>

                  <div className="executive-grid">
                    {cierresEjecutivos.map(c => {
                      const canExpand = filtroSucursal !== "";
                      const isExpanded = canExpand && expandedId === c.id;

                      return (
                        <div key={c.id} className={`executive-card ${isExpanded ? 'expanded' : ''}`}>
                          <div className="exec-header">
                            <div className="exec-info">
                              <span
                                className={`exec-date ${canExpand ? 'clickable' : ''}`}
                                onClick={() => canExpand && setExpandedId(isExpanded ? null : c.id)}
                              >
                                {c.fecha}
                              </span>
                              <span className="exec-suc">{c.sucursal}</span>
                            </div>
                            <div className="exec-total">
                              <span className="label">Consolidado</span>
                              <strong>${c.totalConsolidado.toLocaleString("es-CL")}</strong>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="exec-details-list">
                              {c.registros.map(reg => (
                                <div key={reg.id} className="detail-item">
                                  <div className="det-text">
                                    <span className="det-type">{reg.tipo}</span>
                                    <span className="det-amount">${Number(reg.total).toLocaleString("es-CL")}</span>
                                  </div>
                                  <button onClick={() => eliminarRegistro(reg.id)} className="btn-delete-mini">Eliminar</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {subVista === "metricas" && (
                <div className="metricas-web-view">
                  <div className="metricas-header-anual">
                    <div className="card stat-card-full">
                      <span className="label">Ventas Acumuladas Año Actual</span>
                      <h2 className="amount-hero">${metricasWeb.anualGlobal.toLocaleString("es-CL")}</h2>
                    </div>
                  </div>

                  <div className="metricas-grid-sucursales">
                    {sucursales.map(suc => (
                      <div key={suc} className="card stat-card-sucursal">
                        <span className="label">Mes Actual - {suc}</span>
                        <h3 className="amount-suc">${(metricasWeb.mensualSucursal[suc] || 0).toLocaleString("es-CL")}</h3>
                        <div className="progress-bar-bg">
                           <div className="progress-bar-fill" style={{width: `${Math.min(((metricasWeb.mensualSucursal[suc] || 0) / (metricasWeb.anualGlobal || 1)) * 100, 100)}%`}}></div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="card evolution-card">
                    <h3>Evolución Semanal (Ventas Diarias)</h3>
                    <div className="bar-chart-semanal">
                      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia, idx) => (
                        <div key={dia} className="chart-col">
                          <div
                            className="chart-bar-fill"
                            style={{height: `${Math.min((metricasWeb.semanalEvolucion[idx] / (Math.max(...metricasWeb.semanalEvolucion) || 1)) * 150, 150)}px`}}
                            title={`$${metricasWeb.semanalEvolucion[idx].toLocaleString("es-CL")}`}
                          ></div>
                          <span className="chart-label">{dia}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {subVista === "sucursales" && <div><p>Módulo de Sucursales (Próximamente)</p></div>}
              {subVista === "alertas" && <div><p>Módulo de Alertas (Próximamente)</p></div>}
            </div>
          </div>
        );

      case "configuracion":
        return (
          <div className="card">
            <h2>Configuración</h2>
            <p>Ajustes de perfil y sistema.</p>
            <button onClick={() => signOut(auth)} className="btn-logout" style={{width: '200px', marginTop: '1rem'}}>Cerrar Sesión</button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="dashboard-layout">
      <header className="navbar">
        <div className="nav-container">
          <span className="brand">ERP Edumaco 2.0</span>
          <div className="main-nav-tabs">
            <button className={vista === "ventas" ? "active" : ""} onClick={() => setVista("ventas")}>Ventas</button>
            <button className={vista === "analisis" ? "active" : ""} onClick={() => setVista("analisis")}>Análisis</button>
            <button className={vista === "configuracion" ? "active" : ""} onClick={() => setVista("configuracion")}>Configuración</button>
          </div>
          <div className="user-nav">
            <span className="user-role-badge">{datosUsuario?.rol}</span>
          </div>
        </div>
      </header>

      <main className="content-container">
        {renderContenido()}
      </main>
    </div>
  );
}

export default App;

import React, { useEffect, useState } from "react";
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
  query,
  orderBy
} from "firebase/firestore";
import { auth, db } from "./firebase";
import "./App.css";

function App() {
  const [usuario, setUsuario] = useState(null);
  const [datosUsuario, setDatosUsuario] = useState(null);
  const [loading, setLoading] = useState(true);

  // Catálogos y Datos
  const [sucursales, setSucursales] = useState(["Lebu", "Los Álamos", "Cañete"]);
  const [tiposVenta, setTiposVenta] = useState(["S/B", "Boleta", "Factura", "Transferencia", "Debito/Credito"]);
  const [cierres, setCierres] = useState([]);

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

  // Función robusta para normalizar fechas (Timestamp o String) a dd/MM/yyyy
  const formatearFecha = (fechaOriginal) => {
    if (!fechaOriginal) return "00/00/0000";

    let stringBase = "";

    // Si ya es un String, lo normalizamos (limpiando posibles horas "dd/MM/yyyy HH:mm")
    if (typeof fechaOriginal === 'string') {
      stringBase = fechaOriginal;
    }
    // Si es un Timestamp de Firestore {seconds, nanoseconds}
    else if (fechaOriginal.seconds) {
      const d = new Date(fechaOriginal.seconds * 1000);
      stringBase = String(d.getDate()).padStart(2, '0') + '/' +
                   String(d.getMonth() + 1).padStart(2, '0') + '/' +
                   d.getFullYear();
    } else {
      return "Fecha Inválida";
    }

    // Normalización definitiva: Extraer solo dd/MM/yyyy eliminando horas si existen
    return stringBase.split(" ")[0].trim();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUsuario(user);
      if (user) {
        setFechaCierre(obtenerFechaActual());
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setDatosUsuario(userSnap.data());
        } else {
          const perfilBasico = { nombre: user.displayName || "Usuario", email: user.email, rol: "vendedor", aprobado: false, activo: true };
          await setDoc(userRef, perfilBasico);
          setDatosUsuario(perfilBasico);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // CARGA DESDE VENTAS Y AGRUPAMIENTO REALTIME
  useEffect(() => {
    if (!usuario) return;

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
      const ventasRaw = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          fecha: formatearFecha(data.fecha) // Normalización inmediata
        };
      });

      // Agrupar ventas individuales para mostrar como "Cierres" en la UI
      const grupos = {};
      ventasRaw.forEach(v => {
        const key = `${v.fecha}_${v.sucursal}`;
        if (!grupos[key]) {
          grupos[key] = {
            id: key,
            fecha: v.fecha,
            sucursal: v.sucursal,
            ventas: {},
            usuario: v.usuario || "Desconocido",
            lastUpdated: v.lastUpdated || 0
          };
        }

        // Acumular el monto asegurando que sea numérico y el tipo esté limpio
        const tipo = String(v.tipo || "Otros").trim();
        const monto = Number(v.total) || 0;

        grupos[key].ventas[tipo] = (grupos[key].ventas[tipo] || 0) + monto;

        if (v.lastUpdated > grupos[key].lastUpdated) {
          grupos[key].lastUpdated = v.lastUpdated;
          grupos[key].usuario = v.usuario;
        }
      });

      setCierres(Object.values(grupos).sort((a, b) => b.lastUpdated - a.lastUpdated));
    });

    cargarCatalogos();
    return () => unsubVentas();
  }, [usuario]);

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

        // ID determinista para evitar duplicados al corregir en la web
        const docID = `${fechaID}_${sucursalSeleccionada}_${tipo.replace(/\//g, "")}`;
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

      // Limpiar inputs
      const reset = {};
      tiposVenta.forEach(t => reset[t] = "");
      setVentasInputs(reset);
    } catch (e) {
      console.error(e);
      alert("Error de permisos o conexión. Verifique su rol.");
    }
  };

  const iniciarSesion = async () => {
    try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { alert("Error login"); }
  };

  if (loading) return <div className="loader-screen"><h1>Cargando...</h1></div>;

  if (!usuario) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Gestor Pro</h1>
          <button onClick={iniciarSesion} className="btn-google">Entrar con Google</button>
        </div>
      </div>
    );
  }

  const puedeEditarFecha = datosUsuario?.rol === "admin";

  return (
    <div className="dashboard-layout">
      <header className="navbar">
        <div className="nav-container">
          <span className="brand">Sistema de Cierres</span>
          <div className="user-nav">
            <span className="user-role-badge">{datosUsuario?.rol}</span>
            <button onClick={() => signOut(auth)} className="btn-logout">Salir</button>
          </div>
        </div>
      </header>

      <main className="content-container">
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

        <section className="history-section">
          <h2 className="section-title">Historial Unificado (Ventas)</h2>
          <div className="history-grid">
            {cierres.map(c => (
              <div className="cierre-card" key={c.id}>
                <div className="c-card-header">
                  <span className="c-date">{c.fecha}</span>
                  <span className="c-sucursal">{c.sucursal}</span>
                </div>
                <div className="c-card-body">
                  <div className="c-details">
                    {Object.entries(c.ventas).map(([tipo, valor]) => (
                      <div key={`${c.id}-${tipo}`} className="c-detail-row">
                        <span>{tipo}</span>
                        <span>${Number(valor).toLocaleString("es-CL")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="c-total-row">
                    <span>Total</span>
                    <strong>${Object.values(c.ventas).reduce((acc, v) => acc + v, 0).toLocaleString("es-CL")}</strong>
                  </div>
                </div>
                <div className="c-card-footer">Registrado por: {c.usuario}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

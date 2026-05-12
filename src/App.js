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

  // Formateador de fecha manual dd/MM/yyyy
  const obtenerFechaActual = () => {
    const hoy = new Date();
    return String(hoy.getDate()).padStart(2, '0') + '/' +
           String(hoy.getMonth() + 1).padStart(2, '0') + '/' +
           hoy.getFullYear();
  };

  // Detectar sesión y Roles
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUsuario(user);
      if (user) {
        setFechaCierre(obtenerFechaActual());

        // Leer Roles desde Firestore
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setDatosUsuario(userSnap.data());
        } else {
          // Crear perfil básico si no existe
          const perfilBasico = {
            nombre: user.displayName || "Usuario Nuevo",
            email: user.email,
            rol: "vendedor",
            aprobado: false,
            activo: true
          };
          await setDoc(userRef, perfilBasico);
          setDatosUsuario(perfilBasico);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Cargar Catálogos y Cierres
  useEffect(() => {
    if (!usuario) return;

    const cargarCatalogos = async () => {
      try {
        const sRef = doc(db, "catalogos", "sucursales");
        const tRef = doc(db, "catalogos", "tipos_venta");
        const [sSnap, tSnap] = await Promise.all([getDoc(sRef), getDoc(tRef)]);

        if (sSnap.exists()) {
          const items = sSnap.data().items;
          setSucursales(items);
          setSucursalSeleccionada(items[0]);
        }
        if (tSnap.exists()) {
          const items = tSnap.data().items;
          setTiposVenta(items);
          // Inicializar inputs de ventas en 0
          const initialInputs = {};
          items.forEach(t => initialInputs[t] = "");
          setVentasInputs(initialInputs);
        }
      } catch (e) { console.error("Error catálogos:", e); }
    };

    const q = query(collection(db, "cierres_diarios"), orderBy("lastUpdated", "desc"));
    const unsubCierres = onSnapshot(q, (snap) => {
      const listaActualizada = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));
      // Forzar nueva referencia del array para asegurar re-render completo
      setCierres([...listaActualizada]);
    });

    cargarCatalogos();
    return () => unsubCierres();
  }, [usuario]);

  // Calcular Total Automáticamente
  useEffect(() => {
    const suma = Object.values(ventasInputs).reduce((acc, val) => acc + (Number(val) || 0), 0);
    setTotalGeneral(suma);
  }, [ventasInputs]);

  const manejarCambioInput = (tipo, valor) => {
    setVentasInputs(prev => ({ ...prev, [tipo]: valor }));
  };

  const guardarCierre = async (e) => {
    e.preventDefault();
    if (totalGeneral === 0) return alert("Por favor, ingrese valores en las ventas.");

    try {
      // Normalización y Validaciones
      const ventasFinales = {};
      tiposVenta.forEach(t => {
        ventasFinales[t] = Number(ventasInputs[t]) || 0;
      });

      const sucursalTrim = sucursalSeleccionada.trim();
      const fechaID = fechaCierre.replace(/\//g, "-");
      const docID = `${fechaID}_${sucursalTrim}`;

      await setDoc(doc(db, "cierres_diarios", docID), {
        fecha: fechaCierre,
        sucursal: sucursalTrim,
        ventas: ventasFinales,
        totalGeneral: totalGeneral,
        usuario: usuario.displayName || usuario.email,
        usuarioId: usuario.uid,
        lastUpdated: Date.now()
      });

      alert("Cierre diario guardado exitosamente.");
    } catch (e) {
      console.error(e);
      alert("Error al guardar el cierre.");
    }
  };

  const iniciarSesion = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) { alert("Error al iniciar sesión"); }
  };

  if (loading) return <div className="loader-screen"><h1>Cargando Sistema...</h1></div>;

  if (!usuario) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Gestor Pro</h1>
          <p>Inicia sesión para registrar ventas</p>
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
            <span>{usuario.email}</span>
            <button onClick={() => signOut(auth)} className="btn-logout">Cerrar Sesión</button>
          </div>
        </div>
      </header>

      <main className="content-container">
        {/* Formulario de Cierre */}
        <section className="card form-section">
          <div className="card-header">
            <h2>Registrar Cierre Diario</h2>
            <p>Ingresa los montos correspondientes a cada tipo de venta</p>
          </div>

          <form onSubmit={guardarCierre}>
            <div className="top-inputs">
              <div className="field">
                <label>Sucursal</label>
                <select
                  value={sucursalSeleccionada}
                  onChange={(e) => setSucursalSeleccionada(e.target.value)}
                >
                  {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="field">
                <label>Fecha</label>
                <input
                  type="text"
                  value={fechaCierre}
                  onChange={(e) => setFechaCierre(e.target.value)}
                  disabled={!puedeEditarFecha}
                  placeholder="dd/mm/yyyy"
                />
              </div>
            </div>

            <div className="ventas-inputs-grid">
              {tiposVenta.map(tipo => (
                <div className="field" key={tipo}>
                  <label>{tipo}</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={ventasInputs[tipo] || ""}
                    onChange={(e) => manejarCambioInput(tipo, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="summary-bar">
              <div className="total-box">
                <span className="label">Total General:</span>
                <span className="amount">${totalGeneral.toLocaleString("es-CL")}</span>
              </div>
              <button type="submit" className="btn-save">Guardar Cierre</button>
            </div>
          </form>
        </section>

        {/* Historial */}
        <section className="history-section">
          <h2 className="section-title">Historial de Cierres Diarios</h2>
          <div className="history-grid">
            {cierres.map(c => (
              <div className="cierre-card" key={c.id}>
                <div className="c-card-header">
                  <span className="c-date">{c.fecha}</span>
                  <span className="c-sucursal">{c.sucursal}</span>
                </div>
                <div className="c-card-body">
                  <div className="c-details">
                    {Object.entries(c.ventas || {}).map(([tipo, valor]) => (
                      <div key={`${c.id}-${tipo}`} className="c-detail-row">
                        <span>{tipo}</span>
                        <span>${(Number(valor) || 0).toLocaleString("es-CL")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="c-total-row">
                    <span>Total</span>
                    <strong>
                      ${Object.values(c.ventas || {}).reduce((acc, v) => acc + (Number(v) || 0), 0).toLocaleString("es-CL")}
                    </strong>
                  </div>
                </div>
                <div className="c-card-footer">
                  <span className="c-user">Registrado por: {c.usuario}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

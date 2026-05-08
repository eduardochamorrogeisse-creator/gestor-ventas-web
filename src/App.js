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
  addDoc,
  serverTimestamp
} from "firebase/firestore";

import { auth, db } from "./firebase";

import "./App.css";

function App() {

  const [usuario, setUsuario] = useState(null);

  const [ventas, setVentas] = useState([]);

  const [loading, setLoading] = useState(true);

  const [configuracion, setConfiguracion] = useState(null);
  const [sucursales, setSucursales] = useState(["Lebu", "Los Álamos", "Cañete"]);
  const [tiposVenta, setTiposVenta] = useState(["Boleta", "Factura"]);

  const [total, setTotal] = useState("");
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState("Lebu");
  const [tipoSeleccionado, setTipoSeleccionado] = useState("Boleta");

  // Detectar sesión
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, (user) => {

      setUsuario(user);

      setLoading(false);

    });

    return () => unsubscribe();

  }, []);

  // Cargar ventas
  useEffect(() => {

    if (!usuario) return;

    const unsubscribe = onSnapshot(
      collection(db, "ventas"),
      (snapshot) => {

        const docs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setVentas(docs);

      }
    );

    return () => unsubscribe();

  }, [usuario]);

  // Cargar configuración dinámica
  useEffect(() => {

    if (!usuario) return;

    const cargarConfiguracion = async () => {
      try {
        const docRef = doc(db, "configuracion", "general");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setConfiguracion(data);

          if (data.sucursales && Array.isArray(data.sucursales)) {
            setSucursales(data.sucursales);
            setSucursalSeleccionada(data.sucursales[0]);
          }

          if (data.tiposVenta && Array.isArray(data.tiposVenta)) {
            setTiposVenta(data.tiposVenta);
            setTipoSeleccionado(data.tiposVenta[0]);
          }

          console.log("Configuración cargada desde Firestore:", data);
        } else {
          console.log("No existe el documento de configuración. Usando defaults.");
        }
      } catch (error) {
        console.error("Error al cargar configuración:", error);
      }
    };

    cargarConfiguracion();

  }, [usuario]);

  // Login con Google
  const iniciarSesion = async () => {

    try {

      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);

    } catch (error) {

      console.log(error);

      alert("Error al iniciar sesión con Google");

    }

  };

  // Logout
  const cerrarSesion = async () => {

    await signOut(auth);

  };

  // Guardar venta
  const guardarVenta = async (e) => {
    e.preventDefault();

    if (!total || isNaN(total)) {
      alert("Por favor ingrese un total válido");
      return;
    }

    try {
      await addDoc(collection(db, "ventas"), {
        fecha: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        sucursal: sucursalSeleccionada,
        tipo: tipoSeleccionado,
        total: Number(total),
        usuario: usuario.displayName || usuario.email,
        usuarioId: usuario.uid
      });

      setTotal("");
      alert("Venta registrada");
    } catch (error) {
      console.error("Error al guardar venta:", error);
      alert("Error al registrar la venta");
    }
  };

  // Loading
  if (loading) {

    return (
      <div className="App">
        <h1>Cargando...</h1>
      </div>
    );

  }

  // Pantalla login
  if (!usuario) {

    return (

      <div className="App">

        <div style={{ marginTop: 100 }}>

          <h1>Gestor de Ventas</h1>

          <button
            onClick={iniciarSesion}
            style={{
              padding: 15,
              width: 250,
              cursor: "pointer",
              fontSize: 16
            }}
          >
            Iniciar con Google
          </button>

        </div>

      </div>

    );

  }

  // App logueada
  return (

    <div className="App">

      <header className="App-header">

        <h1>Gestor de Ventas</h1>

        <p>
          Bienvenido:
          {" "}
          {usuario.email}
        </p>

        <button
          onClick={cerrarSesion}
          style={{
            padding: 10,
            cursor: "pointer"
          }}
        >
          Cerrar Sesión
        </button>

      </header>

      <main style={{ padding: 20 }}>

        <section style={{
          marginBottom: 40,
          padding: 20,
          border: "1px solid #ccc",
          borderRadius: 8,
          background: "#fff",
          color: "#333",
          maxWidth: 400
        }}>
          <h3>Registrar Nueva Venta</h3>
          <form onSubmit={guardarVenta} style={{ display: "flex", flexDirection: "column", gap: 10 }}>

            <label>Total:</label>
            <input
              type="number"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              placeholder="Ej: 5000"
              style={{ padding: 8 }}
              required
            />

            <label>Sucursal:</label>
            <select
              value={sucursalSeleccionada}
              onChange={(e) => setSucursalSeleccionada(e.target.value)}
              style={{ padding: 8 }}
            >
              {sucursales.map((s, index) => (
                <option key={index} value={s}>{s}</option>
              ))}
            </select>

            <label>Tipo de Venta:</label>
            <select
              value={tipoSeleccionado}
              onChange={(e) => setTipoSeleccionado(e.target.value)}
              style={{ padding: 8 }}
            >
              {tiposVenta.map((t, index) => (
                <option key={index} value={t}>{t}</option>
              ))}
            </select>

            <button
              type="submit"
              style={{
                marginTop: 10,
                padding: 10,
                cursor: "pointer",
                background: "#28a745",
                color: "white",
                border: "none",
                borderRadius: 4
              }}
            >
              Guardar Venta
            </button>
          </form>
        </section>

        <h2>Ventas</h2>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >

          {
            ventas.map((venta) => (

              <div
                key={venta.id}
                style={{
                  border: "1px solid #ccc",
                  padding: 10,
                  borderRadius: 8,
                  textAlign: "left",
                  background: "#f9f9f9",
                  color: "#333"
                }}
              >

                <p>
                  <strong>Usuario:</strong>
                  {" "}
                  {venta.usuario}
                </p>

                <p>
                  <strong>Total:</strong>
                  {" "}
                  ${venta.total}
                </p>

                <p>
                  <strong>Sucursal:</strong>
                  {" "}
                  {venta.sucursal}
                </p>

                <p>
                  <strong>Fecha:</strong>
                  {" "}
                  {venta.fecha?.seconds
                    ? new Date(
                        venta.fecha.seconds * 1000
                      ).toLocaleDateString()
                    : venta.fecha}
                </p>

              </div>

            ))
          }

        </div>

      </main>

    </div>

  );

}

export default App;
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import './App.css';

function App() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Referencia a la colección
    const ventasCollection = collection(db, "ventas");

    // Suscripción en tiempo real
    const unsubscribe = onSnapshot(ventasCollection,
      (querySnapshot) => {
        const docs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setVentas(docs);
        setLoading(false);
      },
      (err) => {
        console.error("Error en tiempo real: ", err);
        setError("Error al conectar con la base de datos.");
        setLoading(false);
      }
    );

    // Limpiar suscripción al desmontar el componente
    return () => unsubscribe();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>Gestor de Ventas (Tiempo Real)</h1>
      </header>
      <main style={{ padding: '20px' }}>
        {loading && <p>Cargando ventas...</p>}

        {error && <p style={{ color: 'red' }}>{error}</p>}

        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ventas.length === 0 ? (
              <p>No hay ventas registradas.</p>
            ) : (
              ventas.map((venta) => (
                <div key={venta.id} style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px', textAlign: 'left', background: '#f9f9f9', color: '#333' }}>
                  <p><strong>Usuario:</strong> {venta.usuario}</p>
                  <p><strong>Total:</strong> ${venta.total}</p>
                  <p><strong>Sucursal:</strong> {venta.sucursal}</p>
                  <p><strong>Fecha:</strong> {venta.fecha?.seconds ? new Date(venta.fecha.seconds * 1000).toLocaleDateString() : venta.fecha}</p>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

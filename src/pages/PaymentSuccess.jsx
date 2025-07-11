// Archivo: pages/PaymentSuccess.jsx

import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Loader2 } from 'lucide-react'; // Para el indicador de carga

// Carga tu clave pública de Stripe.
const VITE_STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = VITE_STRIPE_PUBLISHABLE_KEY ? loadStripe(VITE_STRIPE_PUBLISHABLE_KEY) : null;

const PaymentSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [paymentIntent, setPaymentIntent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Obtiene el client_secret del PaymentIntent de la URL
    const clientSecret = params.get('payment_intent_client_secret');
    const sessionId = params.get('session_id');

    if (!clientSecret && !sessionId) {
      setError('No se encontró el client secret del pago ni el ID de sesión.');
      setLoading(false);
      return;
    }

    if (!stripePromise) {
        setError('La configuración de pagos no está disponible. Por favor, contacta a soporte.');
        setLoading(false);
        return;
    }

    const verifyPayment = async () => {
      try {
        const stripe = await stripePromise;
        if (!stripe) {
            throw new Error('Failed to load Stripe.js');
        }

        let retrievedPaymentIntent = null;
        let stripeError = null;

        if (clientSecret) {
          // Si tenemos clientSecret, intentamos recuperar el PaymentIntent directamente
          const result = await stripe.retrievePaymentIntent(clientSecret);
          retrievedPaymentIntent = result.paymentIntent;
          stripeError = result.error;
        } else if (sessionId) {
          // Si tenemos sessionId, llamamos a nuestro endpoint de backend para recuperar la Checkout Session
          const response = await fetch(`/api/stripe/retrieve-checkout-session?sessionId=${sessionId}`);
          const data = await response.json();

          if (!response.ok) {
            stripeError = { message: data.error || 'Error al recuperar la sesión de checkout.' };
          } else if (data.session) {
            // Si la sesión tiene un payment_intent (para pagos únicos), lo usamos
            if (data.session.payment_status === 'paid' && data.session.payment_intent) {
                const piResult = await stripe.retrievePaymentIntent(data.session.payment_intent);
                retrievedPaymentIntent = piResult.paymentIntent;
                stripeError = piResult.error;
            } else if (data.session.mode === 'subscription' && data.session.subscription) {
                // Si es una suscripción, recuperamos la suscripción y verificamos su estado
                const subscriptionId = data.session.subscription;
                const responseSubscription = await fetch(`/api/stripe/retrieve-subscription?subscriptionId=${subscriptionId}`);
                const dataSubscription = await responseSubscription.json();

                if (!responseSubscription.ok) {
                    stripeError = { message: dataSubscription.error || 'Error al recuperar la suscripción.' };
                } else if (dataSubscription.subscription && (dataSubscription.subscription.status === 'active' || dataSubscription.subscription.status === 'trialing')) {
                    // Creamos un "pseudo" PaymentIntent para mantener la estructura del estado
                    retrievedPaymentIntent = { status: 'succeeded', id: subscriptionId, type: 'subscription' };
                } else {
                    setError('No se pudo encontrar una suscripción activa asociada a la sesión de checkout.');
                    setLoading(false);
                    return;
                }
            } else {
                setError('No se pudo encontrar un PaymentIntent o una suscripción asociada a la sesión de checkout.');
                setLoading(false);
                return;
            }
          } else {
            setError('No se pudo encontrar una sesión de checkout válida.');
            setLoading(false);
            return;
          }
        }

        if (stripeError) {
          console.error('Error retrieving Stripe object:', stripeError);
          setError(stripeError.message || 'Error al verificar el estado del pago.');
        } else if (retrievedPaymentIntent) {
          setPaymentIntent(retrievedPaymentIntent);
          if (retrievedPaymentIntent.status !== 'succeeded') {
              console.warn('PaymentIntent status is not succeeded:', retrievedPaymentIntent.status);
          }
        } else {
             setError('No se pudo recuperar el PaymentIntent.');
        }

      } catch (err) {
        console.error('Payment verification failed:', err);
        setError(err.message || 'Ocurrió un error al verificar tu pago.');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();

  }, [location.search, navigate]); // Dependencias: re-ejecutar si cambian los parámetros de la URL

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="mr-2 h-8 w-8 animate-spin text-purple-600" />
        <span className="text-lg">Verificando tu pago...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-red-600 p-4">
        <h2 className="text-xl font-semibold mb-2">Error al Verificar el Pago</h2>
        <p className="text-center">{error}</p>
        <button
            onClick={() => navigate('/dashboard')} // O a la página de precios
            className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
            Ir a mi Dashboard
        </button>
      </div>
    );
  }

  // Si llegamos aquí, no hay error y no está cargando.
  // Mostramos el mensaje de éxito solo si el PaymentIntent existe y su estado es 'succeeded'.
  if (paymentIntent && paymentIntent.status === 'succeeded') {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
          <div className="bg-white p-8 sm:p-12 rounded-lg shadow-xl max-w-md w-full">
            <svg className="w-16 h-16 sm:w-20 sm:h-20 text-green-500 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-3">¡Pago Exitoso!</h1>
            <p className="text-gray-600 mb-6 sm:text-lg">
              Gracias por tu compra. Tu suscripción o producto ya debería estar activo.
            </p>
            <p className="text-sm text-gray-500 mb-8">
              Si tienes alguna pregunta o el acceso no se refleja inmediatamente, por favor contacta a nuestro equipo de soporte. A veces, la actualización puede tardar unos instantes en procesarse completamente.
            </p>
            <Link
              to="/dashboard" // Ajusta esta ruta a tu dashboard
              className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors duration-150"
            >
              Ir a mi Dashboard
            </Link>
          </div>
        </div>
      );
  }

  // Si no está cargando, no hay error, pero el PI no es succeeded o no existe
  // Podrías mostrar un mensaje genérico o redirigir.
  return (
      <div className="flex flex-col justify-center items-center min-h-screen text-orange-500 p-4">
          <h2 className="text-xl font-semibold mb-2">Estado del Pago Desconocido</h2>
          <p className="text-center">No pudimos confirmar el estado de tu pago. Por favor, verifica tu dashboard o contacta a soporte.</p>
          <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
              Ir a mi Dashboard
          </button>
      </div>
  );
};

export default PaymentSuccess;
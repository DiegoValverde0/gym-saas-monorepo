el siguiente error figura cuando selecciono otra sucursal como acceso y otra sucursal para asignar donde trabajará, lo que me parece que es un doble trabajo, debería agarrar la primera y prellenar por defecto para no tener que volver a seleccionar, además si selecciono una sucursal por defecto me debería mostrar una lista filtrada, de la sucursal que tengo seleccionada, y solo debería permitir elegir en que sucursal trabajará el empleado cuando este tiene acceso a todas las sucursales, por ejemplo
arregla esa lógica y el error siguiente
{statusCode: 400, message: "Esta persona no tiene acceso a la organización.", errors: "Bad Request",…}
errors
: 
"Bad Request"
message
: 
"Esta persona no tiene acceso a la organización."
path
: 
"/personal/9422947e-b3c0-4896-9b3f-7bedfbf1b357/equipo"
statusCode
: 
400
timestamp
: 
"2026-09-24T03:49:37.317Z"

por otra parte no entiendo para que sirve ahora el registro de turnos de trabajo, tengo este mensaje pero necesito que se me explique con mayor detalle como funciona el flujo completo de este módulo
Turnos de Trabajo
Horario de staff por sucursal.

Turnos día por día, generados solos a partir del horario semanal de cada persona (se edita en Equipo). Acá se registran las excepciones: marca un turno como Ausente o Cancelado, o agrega uno extra.

sigue sin convencerme del todo el múdulo de asignación de clases, no hay coherencia entre las creaciones de clases, que deberían decirme, 1 para que sucursal, 2 con que instructor, 3 mostrarme los horarios disponibles directamente como para marcar de manera muy inteligente, por ejemplo primero definiendo la duración de la clase, los días de la semana que se imparte y el horario de inicio, ya que se asume que es recurrente, el próximo mes se generan los turnos solos, debería permitirme elegir si esa clase está habilitada para cierto tipo de membresía, por ejemplo, o si por el contrario puedo crear una clase abierta que esté 
para toda la organización, etc. necesito más inteligencia y facilidades al momento de crear turnos, clases, y registro del personal staff, que no sea muy complicado, vamos en buen camino pero se puede simplificar de mejor forma y también para quien lo requiera con mucho más rigor se deberían poder paramtrizar, recordemos que este gym saas debe poder cubrir cualquier tipo de gym y lo usarán gente con poca experiencia posiblemente o pequeños emprendedores que nunca habían usado un sistema robusto, en su mayoría, por lo que necesito pensar en modos de uso, como modo simple, modo intermedio y modo experto, para así poder satisfacer a todo el espectro de usuarios. me resulta incluso complicado para mi entender el actual comportamiento, lo que indica que no está bien pensado el flujo de trabajo. a modo de ejemplo, no me queda claro por qué me da la opción de elegir sucursal en un lado para luego decirme que la persona no tiene acceso a la organización, lo cual indica un error lógico en el flujo de creación.   debería permitirme elegir una sucursal como predeterminada y que esa sea la que se muestre por defecto en todos lados, y solo debería permitirme elegir una sucursal en el momento de crear una clase, por ejemplo, para indicar en que sucursal se imparte la clase, y si quiero crear una clase en otra sucursal, debería hacerlo desde el módulo de clases y no desde el calendario, etc.  

así como en este módulo quiero que igualmente simplifiques los otros módulos, ya que me preocupa enormente la experiencia de usuario, que es la base de todo.      
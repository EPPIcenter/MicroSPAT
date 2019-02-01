import os
import sys
import shutil

VENV_PATH = os.path.join(os.environ.get("WORKON_HOME"), "microspat")

if sys.platform == 'darwin':
    activate_script = os.path.join(VENV_PATH, "bin", "activate_this.py")
elif sys.platform == 'win32':
    activate_script = os.path.join(VENV_PATH, "Scripts", "activate_this.py")

exec(open(activate_script).read())

BUILD_PATH = './app'
SERVER_SRC_PATH = './src/microspat-py/'
SERVER_SRC_STATIC_PATH = os.path.join(SERVER_SRC_PATH, "microspat", "static")
CLIENT_SRC_PATH = './src/microspat-js/'
ELECTRON_SRC_PATH = './src/electron/'

SERVER_WORKING_BUILD_PATH_DARWIN = 'darwin-pybuild'
SERVER_WORKING_BUILD_PATH_WIN32 = 'win32-pybuild'

SERVER_BUILD_PATH = os.path.abspath(os.path.join(BUILD_PATH, 'mspat-server'))
CLIENT_BUILD_PATH = os.path.abspath(os.path.join(BUILD_PATH, 'mspat-app'))

if not os.path.exists(BUILD_PATH):
    os.mkdir(BUILD_PATH)

def init_build():
    if os.path.exists(BUILD_PATH):
        shutil.rmtree(BUILD_PATH)
    if not os.path.exists(BUILD_PATH):
        os.mkdir(BUILD_PATH)

def clean_build():
    if os.path.exists(BUILD_PATH):
        shutil.rmtree(BUILD_PATH)

    if os.path.exists(SERVER_WORKING_BUILD_PATH_DARWIN):
        shutil.rmtree(SERVER_WORKING_BUILD_PATH_DARWIN)

    if os.path.exists(SERVER_WORKING_BUILD_PATH_WIN32):
        shutil.rmtree(SERVER_WORKING_BUILD_PATH_WIN32)

def clean_server():
    if os.path.exists(SERVER_BUILD_PATH):
        shutil.rmtree(SERVER_BUILD_PATH)

def build_static_files():
    if not os.path.exists(os.path.abspath(os.path.join(SERVER_BUILD_PATH, 'static'))):
        os.makedirs(os.path.abspath(os.path.join(SERVER_BUILD_PATH, 'static')))
    
    for f in os.listdir(SERVER_SRC_STATIC_PATH):
        shutil.copy(os.path.join(SERVER_SRC_STATIC_PATH, f), os.path.join(SERVER_BUILD_PATH, 'static'))

def build_win_server():
    print("Building Windows Server...")
    shutil.copytree(
        os.path.join(SERVER_SRC_PATH, 'build', 'win32'), 
        os.path.join(SERVER_BUILD_PATH, 'win32')
    )


    # Currently must build manually on windows, looking into setting up vagrant based build pipeline.
    # pyinstaller -y --clean --distpath build\win32 --workpath win32-pybuild --log-level WARN --hidden-import scipy.sparse.csr --hidden-import engineio.async_drivers.eventlet --hidden-import sklearn.neighbors.typedefs --hidden-import sklearn.neighbors.quad_tree --hidden-import sklearn.tree --hidden-import sklearn.tree._utils --hidden-import numpy.core._dtype_ctypes --additional-hooks-dir=additional_hooks run.py

    # if os.path.exists(os.path.join(SERVER_BUILD_PATH, 'win32')):
    #     shutil.rmtree(os.path.join(SERVER_BUILD_PATH, 'win32'))

    # os.system("pip install -q -r {}".format(os.path.join(SERVER_SRC_PATH, 'requirements.txt')))
    # os.system(
    #     f"pyinstaller -y --clean --distpath {os.path.join(SERVER_BUILD_PATH, 'win32')} --workpath {SERVER_WORKING_BUILD_PATH_WIN32} --log-level WARN --hidden-import engineio.async_drivers.gevent --hidden-import sklearn.neighbors.typedefs --hidden-import sklearn.neighbors.quad_tree --hidden-import sklearn.tree --hidden-import sklearn.tree._utils --additional-hooks-dir=additional_hooks {os.path.join(SERVER_SRC_PATH, 'run.py')}"
    # )

def build_darwin_server():
    if sys.platform == 'darwin':
        print("Building Mac Server...")
        os.system(f"pip install -q -r {os.path.join(SERVER_SRC_PATH, 'requirements.txt')}")
        os.system(
            f"pyinstaller -y --clean --distpath {os.path.join(SERVER_BUILD_PATH, 'darwin')} --workpath {SERVER_WORKING_BUILD_PATH_DARWIN} --log-level WARN --hidden-import engineio.async_drivers.gevent --hidden-import sklearn.neighbors.typedefs --hidden-import sklearn.neighbors.quad_tree --hidden-import sklearn.tree --hidden-import sklearn.tree._utils --hidden-import numpy.core._dtype_ctypes --additional-hooks-dir={os.path.join(SERVER_SRC_PATH, 'additional_hooks')} {os.path.join(SERVER_SRC_PATH, 'run.py')}"
        )
    else:
        raise Exception("Cannot compile darwin on non-darwin system.")

def build_client():
    if os.path.exists(CLIENT_BUILD_PATH):
        shutil.rmtree(CLIENT_BUILD_PATH)
    os.system(f"cd {CLIENT_SRC_PATH} && yarn build")
    shutil.move(os.path.join(CLIENT_SRC_PATH, "mspat-app"), CLIENT_BUILD_PATH)

def build_electron():
    for f in os.listdir(ELECTRON_SRC_PATH):
        shutil.copy(os.path.join(ELECTRON_SRC_PATH, f), BUILD_PATH)

def make_dist():
    os.system('yarn dist')
    # if sys.platform == 'darwin':
    #     os.system('yarn dist-mac')
    # elif sys.platform == 'win32':
    #     os.system('yarn dist-win')

def make_darwin_dist():
    os.system('yarn dist-mac')

def make_win_dist():
    os.system('yarn dist-win')

if __name__ == '__main__':
    init_build()
    build_client()
    build_electron()
    
    build_win_server()
    make_win_dist()

    clean_server()
    
    build_darwin_server()
    make_darwin_dist()
    
    clean_build()

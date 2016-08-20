#!/usr/bin/env python
import os

if os.path.exists('.env'):
    print('Importing environment from .env...')
    for line in open('.env'):
        var = line.strip().split('=')
        if len(var) == 2:
            print var[0] + " : " + var[1]
            os.environ[var[0]] = var[1]

from app import socketio, create_app, db, microspat
import webbrowser
from flask_script import Manager, Shell
from flask_migrate import Migrate, MigrateCommand

app = create_app(os.getenv('FLASK_CONFIG') or 'default')
manager = Manager(app)
migrate = Migrate(app, db)


def make_shell_context():
    return dict(app=app, db=db, microspat=microspat)


def make_plasmomapper_shell_context():
    return dict(app=app, db=db, Project=microspat.models.Project, Sample=microspat.models.Sample,
                Plate=microspat.models.Plate, Well=microspat.models.Well, Channel=microspat.models.Channel,
                Ladder=microspat.models.Ladder, Locus=microspat.models.Locus,
                LocusSet=microspat.models.LocusSet, BinEstimatorProject=microspat.models.BinEstimatorProject)


manager.add_command('shell', Shell(make_context=make_shell_context))
manager.add_command('pm_shell', Shell(make_context=make_plasmomapper_shell_context))
manager.add_command('db', MigrateCommand)


@manager.command
def deploy():
    """
    Run Deployment Tasks.  Load data including Dye Sets, Marker Sets, Default Parameter settings.
    """
    from flask.ext.migrate import upgrade
    upgrade()


@manager.command
def runsockets(addr='localhost:5000'):
    host, port = addr.split(':')
    port = int(port) or 5000
    # webbrowser.open("http://localhost:{}/".format(port))
    socketio.run(app, host=host, port=port)

@manager.command
def initDB():
    db.create_all()
    ladder = microspat.models.Ladder(label='HDROX400',
                                     base_sizes=[50, 60, 90, 100, 120, 150, 160, 180, 190, 200, 220, 240, 260, 280, 290, 300, 320, 340,
                                                 360, 380, 400],
                                     color='red')
    db.session.add(ladder)
    db.session.commit()



if __name__ == '__main__':
    manager.run()

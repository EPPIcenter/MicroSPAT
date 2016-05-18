#!/usr/bin/env python
import os

if os.path.exists('.env'):
    print('Importing environment from .env...')
    for line in open('.env'):
        var = line.strip().split('=')
        if len(var) == 2:
            print var[0] + " : " + var[1]
            os.environ[var[0]] = var[1]

from app import socketio, create_app, db
import app.plasmomapper as PlasmoMapper
import webbrowser
from flask.ext.script import Manager, Shell
from flask.ext.migrate import Migrate, MigrateCommand

app = create_app(os.getenv('FLASK_CONFIG') or 'default')
manager = Manager(app)
migrate = Migrate(app, db)


def make_shell_context():
    return dict(app=app, db=db, PlasmoMapper=PlasmoMapper)


def make_plasmomapper_shell_context():
    return dict(app=app, db=db, Project=PlasmoMapper.models.Project, Sample=PlasmoMapper.models.Sample,
                Plate=PlasmoMapper.models.Plate, Well=PlasmoMapper.models.Well, Channel=PlasmoMapper.models.Channel,
                Ladder=PlasmoMapper.models.Ladder, Locus=PlasmoMapper.models.Locus,
                LocusSet=PlasmoMapper.models.LocusSet, BinEstimatorProject=PlasmoMapper.models.BinEstimatorProject)


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
def runsockets():
    port = 5000
    # webbrowser.open("http://localhost:{}/".format(port))
    socketio.run(app, port=port)



if __name__ == '__main__':
    manager.run()

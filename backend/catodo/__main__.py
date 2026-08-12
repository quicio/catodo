import argparse

from catodo.main import run


def main() -> None:
    parser = argparse.ArgumentParser(prog="catodo", description="Cátodo multimedia shell backend")
    sub = parser.add_subparsers(dest="command")

    p_plugin = sub.add_parser("plugin", help="gestionar plugins (canales instalables)")
    p_action = p_plugin.add_subparsers(dest="action")
    p_action.add_parser("list", help="listar plugins instalados")
    for name in ("install", "remove", "enable", "disable"):
        p = p_action.add_parser(name)
        p.add_argument("id", help="id del plugin")

    args = parser.parse_args()

    if args.command == "plugin":
        from catodo.plugin_system import run_cli

        run_cli(args)
        return

    run()


if __name__ == "__main__":
    main()

import json 
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table, Date, Boolean, UniqueConstraint, Index, JSON, Text
from sqlalchemy.orm import relationship, validates
from database import Base

role_permissions = Table(
    'role_permissions', Base.metadata,
    Column('role_id', Integer, ForeignKey('roles.id', ondelete="CASCADE"), primary_key=True, index=True),
    Column('permission_id', Integer, ForeignKey('permissions.id', ondelete="CASCADE"), primary_key=True, index=True)
)

class Role(Base):
    __tablename__ = 'roles'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    users = relationship("User", back_populates="role", lazy="selectin")
    permissions = relationship("Permission", secondary=role_permissions, lazy="selectin")

class Permission(Base):
    __tablename__ = 'permissions'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False, index=True)

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(150), nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role_id = Column(Integer, ForeignKey('roles.id', ondelete="SET NULL"), index=True)
    role = relationship("Role", back_populates="users", lazy="selectin")
    
    # Preferências padrão conforme solicitado
    default_prefs = {
        "ganttStrictDates": True,
        "ganttShowTeamNames": True,
        "ganttStatusFilter": [
            "Em Andamento", "Em Code Review", "Em Correção", "Em Desenvolvimento",
            "Em Garantia", "Em Homologação", "Em QA", "Em RDM", 
            "Em Refinamento", "Impedido", "Paralisado", "Refinamento com TI"
        ]
    }
    
    preferences = Column(JSON, default=default_prefs, server_default=json.dumps(default_prefs), nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    must_change_password = Column(Boolean, default=True)

class Holiday(Base):
    __tablename__ = "holidays"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False, index=True)
    description = Column(String(255), nullable=False)
    category = Column(String(50), default="nacional", index=True)

class WorkItemMetadata(Base):
    __tablename__ = 'work_item_metadata'
    id = Column(Integer, primary_key=True, autoincrement=True)
    work_item_id = Column(Integer, unique=True, nullable=False, index=True)
    area = Column(String(100))
    diretor = Column(String(100))
    frente = Column(String(100))

class AzureWorkItem(Base):
    __tablename__ = 'azure_work_items'
    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, index=True)
    area_path = Column(Text, index=True)
    title = Column(Text)
    work_item_type = Column(String(100), index=True)
    tamanho_projeto = Column(String(50))
    state = Column(String(50), index=True)
    priority = Column(Integer)
    tempo_gasto = Column(Float)
    atribuido = Column(String(100), index=True)
    ini_dev = Column(DateTime, index=True)
    fim_dev = Column(DateTime)
    ini_qa = Column(DateTime)
    fim_qa = Column(DateTime)
    ini_hml = Column(DateTime)
    fim_hml = Column(DateTime)
    est_prod = Column(DateTime)
    
    custom_metadata = relationship(
        "WorkItemMetadata", 
        primaryjoin="AzureWorkItem.id == foreign(WorkItemMetadata.work_item_id)", 
        uselist=False, 
        lazy="selectin", 
        cascade="all, delete-orphan"
    )

class ResourceAssignment(Base):
    __tablename__ = "resource_assignments"
    id = Column(Integer, primary_key=True, index=True)
    work_item_id = Column(Integer, index=True) # FK Física frouxa conforme acordado
    resource_id = Column(Integer, ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    phase = Column(String(50), index=True)
    resource = relationship("Resource", lazy="selectin")
    __table_args__ = (
        UniqueConstraint('work_item_id', 'resource_id', 'phase', name='uq_assignment'),
        Index('idx_assignment_lookup', 'work_item_id', 'resource_id')
    )

class Resource(Base):
    __tablename__ = "resources"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    role = Column(String(100), nullable=True, index=True)
    azure_id = Column(String(100), nullable=True, index=True)
    email = Column(String(150), nullable=True, index=True)
    color_code = Column(String(20), default="#3b82f6")
    is_active = Column(Boolean, default=True, index=True)
    squad = Column(String(100), nullable=True, default="Salesforce", index=True)
    absences = relationship("Absence", back_populates="resource", cascade="all, delete-orphan", lazy="selectin")

class Absence(Base):
    __tablename__ = "absences"
    id = Column(Integer, primary_key=True, index=True)
    resource_id = Column(Integer, ForeignKey("resources.id", ondelete="CASCADE"), index=True)
    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    category = Column(String(50), default="ferias", index=True)
    description = Column(String(255), nullable=True)
    resource = relationship("Resource", back_populates="absences", lazy="selectin")
    __table_args__ = (Index('idx_absence_period', 'resource_id', 'start_date', 'end_date'),)
    @validates("end_date")
    def validate_dates(self, key, value):
        if self.start_date and value < self.start_date:
            raise ValueError("Data fim não pode ser menor que data início")
        return value

class SystemSetting(Base):
    __tablename__ = "system_settings"
    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String(150), default="Squad Master Hub")